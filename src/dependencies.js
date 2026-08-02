const UNSUPPORTED_MANIFESTS = new Map([
  ["pyproject.toml", "Python dependency extraction is not implemented for pyproject.toml yet."],
  ["setup.py", "Python dependency extraction is not implemented for setup.py yet."],
  ["pom.xml", "Java dependency extraction is not implemented yet."],
  ["build.gradle", "Java dependency extraction is not implemented yet."],
  ["build.gradle.kts", "Java dependency extraction is not implemented yet."]
]);
const LOCKFILES = [
  { path: "package-lock.json", kind: "npm-package-lock", ecosystem: "npm", manifests: ["package.json"] },
  { path: "npm-shrinkwrap.json", kind: "npm-shrinkwrap", ecosystem: "npm", manifests: ["package.json"] },
  { path: "yarn.lock", kind: "yarn-lock", ecosystem: "npm", manifests: ["package.json"] },
  { path: "pnpm-lock.yaml", kind: "pnpm-lock", ecosystem: "npm", manifests: ["package.json"] },
  { path: "go.sum", kind: "go-sum", ecosystem: "go", manifests: ["go.mod"] },
  { path: "Cargo.lock", kind: "cargo-lock", ecosystem: "cargo", manifests: ["Cargo.toml"] },
  { path: "requirements.lock", kind: "pip-requirements-lock", ecosystem: "pip", manifests: ["requirements.txt"] },
  { path: "Pipfile.lock", kind: "pipenv-lock", ecosystem: "pip", manifests: ["requirements.txt", "pyproject.toml", "setup.py"] },
  { path: "poetry.lock", kind: "poetry-lock", ecosystem: "pip", manifests: ["pyproject.toml"] },
  { path: "uv.lock", kind: "uv-lock", ecosystem: "pip", manifests: ["pyproject.toml"] }
];

function trimmed(value) {
  return value.trim();
}

function stripLineComment(line) {
  const trimmedLine = line.trim();
  if (trimmedLine.startsWith("#")) return "";
  return trimmedLine.replace(/\s+#.*$/, "").trim();
}

function splitLines(content) {
  return String(content).split(/\r?\n/);
}

function summarizeScopes(entries) {
  const scopes = {};
  for (const entry of entries) scopes[entry.scope] = (scopes[entry.scope] ?? 0) + 1;
  return scopes;
}

function finalizeManifest(manifest, notes = []) {
  manifest.entries.sort((left, right) => left.name.localeCompare(right.name) || left.scope.localeCompare(right.scope));
  manifest.scopes = summarizeScopes(manifest.entries);
  manifest.count = manifest.entries.length;
  if (notes.length > 0) manifest.notes = notes;
  return manifest;
}

function parsePackageJson(path, content) {
  let manifest;
  try {
    manifest = JSON.parse(content);
  } catch (error) {
    return {
      path,
      kind: "npm",
      entries: [],
      scopes: {},
      count: 0,
      notes: [`package.json could not be parsed: ${error.message}`]
    };
  }
  const entries = [];
  const sections = [
    ["dependencies", "production"],
    ["optionalDependencies", "optional"],
    ["peerDependencies", "peer"],
    ["devDependencies", "development"]
  ];
  for (const [key, scope] of sections) {
    const dependencies = manifest[key];
    if (!dependencies || typeof dependencies !== "object") continue;
    for (const [name, spec] of Object.entries(dependencies)) {
      entries.push({ name, spec: String(spec), scope });
    }
  }
  return finalizeManifest({
    path,
    kind: "npm",
    packageName: typeof manifest.name === "string" ? manifest.name : null,
    entries
  });
}

function parseGoMod(path, content) {
  const entries = [];
  const lines = splitLines(content);
  let inRequireBlock = false;
  for (const rawLine of lines) {
    const line = stripLineComment(rawLine);
    if (!line) continue;
    if (inRequireBlock) {
      if (line === ")") {
        inRequireBlock = false;
        continue;
      }
      const match = line.match(/^([^\s]+)\s+([^\s]+)$/);
      if (match) entries.push({ name: match[1], spec: match[2], scope: "required" });
      continue;
    }
    if (/^require\s*\($/.test(line)) {
      inRequireBlock = true;
      continue;
    }
    const match = line.match(/^require\s+([^\s]+)\s+([^\s]+)$/);
    if (match) entries.push({ name: match[1], spec: match[2], scope: "required" });
  }
  return finalizeManifest({ path, kind: "go", entries });
}

function normalizeTomlSpec(spec) {
  const value = trimmed(spec).replace(/,$/, "");
  if (value.startsWith('"') && value.endsWith('"')) return value.slice(1, -1);
  return value;
}

function parseCargoToml(path, content) {
  const entries = [];
  const lines = splitLines(content);
  let section = null;
  for (const rawLine of lines) {
    const line = rawLine.replace(/#.*/, "").trim();
    if (!line) continue;
    const sectionMatch = line.match(/^\[([^\]]+)\]$/);
    if (sectionMatch) {
      section = sectionMatch[1].trim();
      continue;
    }
    if (!section || !section.includes("dependencies")) continue;
    const match = line.match(/^([A-Za-z0-9_.-]+)\s*=\s*(.+)$/);
    if (!match) continue;
    let scope = "production";
    if (section.includes("dev-dependencies")) scope = "development";
    else if (section.includes("build-dependencies")) scope = "build";
    else if (section.startsWith("target.")) scope = "target";
    entries.push({ name: match[1], spec: normalizeTomlSpec(match[2]), scope });
  }
  return finalizeManifest({ path, kind: "cargo", entries });
}

function parseRequirementsTxt(path, content) {
  const entries = [];
  const directives = [];
  const notes = [];
  for (const rawLine of splitLines(content)) {
    const line = stripLineComment(rawLine);
    if (!line) continue;
    if (line.startsWith("-")) {
      directives.push(line);
      notes.push(`Ignored requirements directive: ${line}`);
      continue;
    }
    entries.push({ name: line, spec: line, scope: "requirements" });
  }
  return finalizeManifest({ path, kind: "pip", entries, directives }, notes);
}

function manifestInventory(file) {
  switch (file.path) {
    case "package.json":
      return parsePackageJson(file.path, file.content);
    case "go.mod":
      return parseGoMod(file.path, file.content);
    case "Cargo.toml":
      return parseCargoToml(file.path, file.content);
    case "requirements.txt":
      return parseRequirementsTxt(file.path, file.content);
    default:
      return null;
  }
}

function extractLockfiles(paths) {
  const pathSet = new Set(paths);
  return LOCKFILES
    .filter((lockfile) => pathSet.has(lockfile.path))
    .map((lockfile) => ({ ...lockfile }))
    .sort((left, right) => left.path.localeCompare(right.path));
}

function attachLockfiles(manifests, lockfiles) {
  for (const manifest of manifests) {
    const matching = lockfiles.filter((lockfile) => lockfile.manifests.includes(manifest.path));
    manifest.lockfiles = matching.map((lockfile) => ({ path: lockfile.path, kind: lockfile.kind }));
    manifest.locked = manifest.lockfiles.length > 0;
  }
}

export function extractDependencyInventory(files, { paths } = {}) {
  const manifests = [];
  const skipped = [];
  const availablePaths = paths ?? files.map((file) => file.path);
  const lockfiles = extractLockfiles(availablePaths);
  for (const file of files) {
    const manifest = manifestInventory(file);
    if (manifest) {
      manifests.push(manifest);
      continue;
    }
    if (UNSUPPORTED_MANIFESTS.has(file.path)) {
      skipped.push({ path: file.path, reason: UNSUPPORTED_MANIFESTS.get(file.path) });
    }
  }
  manifests.sort((left, right) => left.path.localeCompare(right.path));
  skipped.sort((left, right) => left.path.localeCompare(right.path));
  attachLockfiles(manifests, lockfiles);
  const dependencyCount = manifests.reduce((total, manifest) => total + manifest.count, 0);
  return {
    manifests,
    skipped,
    lockfiles,
    dependencyCount,
    manifestCount: manifests.length,
    lockfileCount: lockfiles.length
  };
}

function createFinding(manifest, entry, severity, code, message) {
  return {
    path: manifest.path,
    kind: manifest.kind,
    name: entry?.name ?? null,
    scope: entry?.scope ?? null,
    spec: entry?.spec ?? null,
    severity,
    code,
    message
  };
}

function scanPackageJson(manifest) {
  const findings = [];
  for (const entry of manifest.entries) {
    const spec = entry.spec.trim();
    if (/^(?:file:|link:|workspace:)/i.test(spec)) {
      findings.push(createFinding(manifest, entry, "high", "npm-local-reference", `Dependency ${entry.name} uses a local workspace or file reference.`));
    } else if (/^(?:git\+|git:|github:|https?:\/\/)/i.test(spec)) {
      findings.push(createFinding(manifest, entry, "high", "npm-vcs-reference", `Dependency ${entry.name} pulls from a remote source instead of the registry.`));
    } else if (/^(?:latest|\*|x|X|>=|<=|<|>)/.test(spec) || /\|\|/.test(spec)) {
      findings.push(createFinding(manifest, entry, "medium", "npm-broad-range", `Dependency ${entry.name} uses a broad version range: ${spec}.`));
    }
  }
  return findings;
}

function scanGoMod(manifest) {
  const findings = [];
  for (const entry of manifest.entries) {
    const spec = entry.spec.trim();
    if (/\b(?:git|path)\s*=\s*/i.test(spec)) {
      findings.push(createFinding(manifest, entry, "high", "go-source-reference", `Module ${entry.name} uses a path or git replacement reference.`));
    }
  }
  return findings;
}

function scanCargoToml(manifest) {
  const findings = [];
  for (const entry of manifest.entries) {
    const spec = entry.spec.trim();
    if (/\b(?:git|path)\s*=\s*/i.test(spec)) {
      findings.push(createFinding(manifest, entry, "high", "cargo-source-reference", `Crate ${entry.name} uses a path or git dependency reference.`));
    } else if (/^(?:latest|\*|>=|<=|<|>)/.test(spec)) {
      findings.push(createFinding(manifest, entry, "medium", "cargo-broad-range", `Crate ${entry.name} uses a broad version requirement: ${spec}.`));
    }
  }
  return findings;
}

function scanRequirementsTxt(manifest) {
  const findings = [];
  for (const entry of manifest.entries) {
    const spec = entry.spec.trim();
    if (/^(?:-e|--editable)\b/i.test(spec) || /(?:@\s*)?(?:git\+|hg\+|svn\+|bzr\+|file:|https?:\/\/)/i.test(spec)) {
      findings.push(createFinding(manifest, entry, "high", "pip-source-reference", `Requirement ${entry.name} uses a direct source or editable reference.`));
    }
  }
  for (const directive of manifest.directives ?? []) {
    if (/^(?:-r|--requirement)\b/i.test(directive)) {
      findings.push(createFinding(manifest, { name: directive, spec: directive, scope: "directive" }, "medium", "pip-requirement-include", "Requirements file includes another requirements file."));
    } else if (/^(?:--index-url|--extra-index-url|--find-links|--trusted-host)\b/i.test(directive)) {
      findings.push(createFinding(manifest, { name: directive, spec: directive, scope: "directive" }, "medium", "pip-index-directive", "Requirements file uses an alternate package source or host trust override."));
    }
  }
  return findings;
}

function scanManifest(manifest) {
  if (manifest.kind === "npm") return scanPackageJson(manifest);
  if (manifest.kind === "go") return scanGoMod(manifest);
  if (manifest.kind === "cargo") return scanCargoToml(manifest);
  if (manifest.kind === "pip") return scanRequirementsTxt(manifest);
  return [];
}

export function assessDependencyRisks(inventory) {
  const findings = inventory.manifests.flatMap(scanManifest);
  findings.sort((left, right) => left.severity.localeCompare(right.severity) || left.path.localeCompare(right.path) || left.name.localeCompare(right.name));
  const severityCounts = { high: 0, medium: 0, low: 0 };
  for (const finding of findings) severityCounts[finding.severity] = (severityCounts[finding.severity] ?? 0) + 1;
  return {
    findings,
    findingCount: findings.length,
    severityCounts
  };
}
