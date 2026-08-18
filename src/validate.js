import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { readFileSync } from "node:fs";

const DEFAULT_MAX_BYTES = 1024 * 1024 * 1024;
const SHA256 = /^sha256:([0-9a-f]{64})$/i;
const INSTALLER_EXTENSIONS = {
  "windows-x64": /\.msi$/i,
  "macos-universal": /\.(dmg|pkg)$/i,
  "linux-x64": /\.(appimage|deb|rpm)$/i
};
const SUPPORTED_PLATFORMS = new Set(Object.keys(INSTALLER_EXTENSIONS));
const BUILD_PACKAGING = {
  "build-electron": "electron",
  "build-tauri": "tauri",
  "build-native": null
};
const NATIVE_BUILD_STRATEGIES = new Set(["go-native", "rust-native", "python-native"]);

const schema = JSON.parse(readFileSync(new URL("../schema/installermarker.schema.json", import.meta.url), "utf8"));
const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);
const validateSchema = ajv.compile(schema);

function diagnostic(severity, code, path, message, blocks = []) {
  return { severity, code, path: path || "/", message, blocks };
}

function repositoryCoordinates(repositoryUrl) {
  try {
    const url = new URL(repositoryUrl);
    const segments = url.pathname.split("/").filter(Boolean);
    if (url.protocol !== "https:" || url.hostname !== "github.com" || segments.length !== 2 || url.username || url.password || url.port) return null;
    return { owner: segments[0], repository: segments[1].replace(/\.git$/i, "") };
  } catch {
    return null;
  }
}

function validateAssetUrl(assetUrl, source, expectedName) {
  try {
    const url = new URL(assetUrl);
    const expectedPrefix = `/${source.owner}/${source.repository}/releases/download/`.toLowerCase();
    const urlName = decodeURIComponent(url.pathname.split("/").at(-1));
    if (url.protocol !== "https:" || url.hostname !== "github.com" || !url.pathname.toLowerCase().startsWith(expectedPrefix) || url.username || url.password || url.port) {
      return "Installer inputs must come from the source repository's GitHub Releases.";
    }
    if (urlName !== expectedName) return "Installer input filename must match its GitHub Release URL.";
  } catch {
    return "Installer input URL must be valid.";
  }
  return null;
}

function semanticDiagnostics(recipe, maxBytes) {
  const diagnostics = [];
  const materializableTargets = [];
  const buildableTargets = [];
  const source = repositoryCoordinates(recipe.source.repository);
  if (!source) {
    diagnostics.push(diagnostic("error", "invalid-source", "/source/repository", "source.repository must be an HTTPS GitHub repository URL.", ["materialize", "build"]));
    return { diagnostics, materializableTargets, buildableTargets };
  }

  if (recipe.source.license === "NOASSERTION") {
    diagnostics.push(diagnostic("warning", "license-unresolved", "/source/license", "Source license was not detected; confirm redistribution rights before packaging."));
  }

  if (String(recipe.application.entrypoint).trim().startsWith("TODO:")) {
    diagnostics.push(diagnostic("warning", "entrypoint-unresolved", "/application/entrypoint", "Application entrypoint still needs review."));
  }
  const buildCommandResolved = !String(recipe.build.command).trim().startsWith("TODO:");
  if (!buildCommandResolved) {
    diagnostics.push(diagnostic("warning", "build-command-unresolved", "/build/command", "Build command still needs review.", ["build"]));
  }
  const artifactDirectories = recipe.build.artifactDirectories;
  const artifactDirectoriesValid = Array.isArray(artifactDirectories)
    && artifactDirectories.length > 0
    && artifactDirectories.every((directory) => typeof directory === "string" && directory && !directory.startsWith("/") && !directory.split(/[\\/]/).includes(".."));
  const requestsSourceBuild = recipe.targets.some((target) => Object.hasOwn(BUILD_PACKAGING, target.packaging));
  if (requestsSourceBuild && !artifactDirectoriesValid) {
    diagnostics.push(diagnostic(
      buildCommandResolved ? "error" : "warning",
      "artifact-directories-missing",
      "/build/artifactDirectories",
      "Source builds require one or more relative artifact directories.",
      ["build"]
    ));
  }

  const platforms = new Set();
  const inputNames = new Set();
  for (const [index, target] of recipe.targets.entries()) {
    const path = `/targets/${index}`;
    if (!SUPPORTED_PLATFORMS.has(target.platform)) {
      diagnostics.push(diagnostic("error", "unsupported-platform", `${path}/platform`, `Unsupported target platform: ${target.platform}.`, ["materialize", "build"]));
      continue;
    }
    if (platforms.has(target.platform)) {
      diagnostics.push(diagnostic("error", "duplicate-platform", `${path}/platform`, `Duplicate target platform: ${target.platform}.`, ["materialize", "build"]));
      continue;
    }
    platforms.add(target.platform);

    if (Object.hasOwn(BUILD_PACKAGING, target.packaging)) {
      const requiredStrategy = BUILD_PACKAGING[target.packaging];
      const targetDiagnostics = [];
      if (requiredStrategy && recipe.build.strategy !== requiredStrategy) {
        targetDiagnostics.push(diagnostic("error", "build-strategy-mismatch", `${path}/packaging`, `${target.packaging} requires build.strategy to be ${requiredStrategy}.`, ["build"]));
      }
      if (target.packaging === "build-native" && !NATIVE_BUILD_STRATEGIES.has(recipe.build.strategy)) {
        targetDiagnostics.push(diagnostic("error", "native-build-strategy-invalid", "/build/strategy", `build-native requires one of: ${[...NATIVE_BUILD_STRATEGIES].join(", ")}.`, ["build"]));
      }
      if (target.status === "needs_review") {
        targetDiagnostics.push(diagnostic("warning", "build-target-unconfirmed", `${path}/status`, "Confirm this target supports native source builds before execution.", ["build"]));
      }
      diagnostics.push(...targetDiagnostics);
      if (targetDiagnostics.length === 0 && buildCommandResolved && artifactDirectoriesValid) {
        buildableTargets.push({
          platform: target.platform,
          packaging: target.packaging,
          strategy: requiredStrategy ?? recipe.build.strategy,
          command: recipe.build.command,
          artifactDirectories
        });
      }
      continue;
    }

    if (target.packaging !== "reuse-installer") {
      const message = target.packaging === "wrap-release-asset"
        ? "This target has a release asset but still needs platform-specific installer wrapping."
        : "This target still needs a packaging strategy.";
      diagnostics.push(diagnostic("warning", "materialization-unavailable", `${path}/packaging`, message));
      continue;
    }
    if (target.status !== "available") {
      diagnostics.push(diagnostic("error", "installer-unavailable", `${path}/status`, "reuse-installer requires an available target release.", ["materialize"]));
      continue;
    }
    if (!target.input) {
      diagnostics.push(diagnostic("error", "installer-input-missing", `${path}/input`, "reuse-installer requires an input asset.", ["materialize"]));
      continue;
    }

    const input = target.input;
    const targetDiagnostics = [];
    if (typeof input.name !== "string" || !input.name || input.name !== input.name.split(/[\\/]/).at(-1) || [".", ".."].includes(input.name)) {
      targetDiagnostics.push(diagnostic("error", "invalid-input-name", `${path}/input/name`, "Installer input name must be a plain filename.", ["materialize"]));
    } else if (!INSTALLER_EXTENSIONS[target.platform].test(input.name)) {
      targetDiagnostics.push(diagnostic("error", "invalid-installer-format", `${path}/input/name`, `${target.platform} input is not a supported installer format.`, ["materialize"]));
    } else if (inputNames.has(input.name)) {
      targetDiagnostics.push(diagnostic("error", "duplicate-input-name", `${path}/input/name`, `Duplicate installer filename: ${input.name}.`, ["materialize"]));
    } else {
      inputNames.add(input.name);
    }
    if (!Number.isSafeInteger(input.size) || input.size <= 0 || input.size > maxBytes) {
      targetDiagnostics.push(diagnostic("error", "invalid-input-size", `${path}/input/size`, `Installer input size must be between 1 and ${maxBytes} bytes.`, ["materialize"]));
    }
    const digest = typeof input.digest === "string" ? input.digest.match(SHA256) : null;
    if (input.digest === null || input.digest === undefined || input.digest === "") {
      targetDiagnostics.push(diagnostic("warning", "digest-missing", `${path}/input/digest`, "A GitHub-published SHA-256 digest is required before materialization.", ["materialize"]));
    } else if (!digest) {
      targetDiagnostics.push(diagnostic("error", "invalid-digest", `${path}/input/digest`, "Installer digest must use the sha256:<hex> format.", ["materialize"]));
    }
    if (typeof input.name === "string") {
      const urlError = validateAssetUrl(input.url, source, input.name);
      if (urlError) targetDiagnostics.push(diagnostic("error", "invalid-input-url", `${path}/input/url`, urlError, ["materialize"]));
    }
    diagnostics.push(...targetDiagnostics);
    if (targetDiagnostics.length === 0) {
      materializableTargets.push({
        platform: target.platform,
        name: input.name,
        url: input.url,
        expectedSize: input.size,
        expectedSha256: digest[1].toLowerCase()
      });
    }
  }
  return { diagnostics, materializableTargets, buildableTargets };
}

export function validateRecipe(recipe, { maxBytes = DEFAULT_MAX_BYTES } = {}) {
  const validSchema = validateSchema(recipe);
  const diagnostics = validSchema
    ? []
    : validateSchema.errors.map((error) => diagnostic("error", `schema-${error.keyword}`, error.instancePath, error.message ?? "Invalid recipe structure."));
  let materializableTargets = [];
  let buildableTargets = [];
  if (validSchema) {
    const semantic = semanticDiagnostics(recipe, maxBytes);
    diagnostics.push(...semantic.diagnostics);
    materializableTargets = semantic.materializableTargets;
    buildableTargets = semantic.buildableTargets;
  }
  const errors = diagnostics.filter((item) => item.severity === "error");
  const warnings = diagnostics.filter((item) => item.severity === "warning");
  const materializeBlockers = diagnostics.filter((item) => item.blocks.includes("materialize"));
  const buildBlockers = diagnostics.filter((item) => item.blocks.includes("build"));
  return {
    valid: errors.length === 0,
    readyForMaterialize: errors.length === 0 && materializeBlockers.length === 0 && materializableTargets.length > 0,
    readyForBuild: errors.length === 0 && buildBlockers.length === 0 && buildableTargets.length > 0,
    materializableTargets,
    buildableTargets,
    errors,
    warnings,
    diagnostics
  };
}

export function createMaterializationPlan(recipe, options) {
  const result = validateRecipe(recipe, options);
  const targetPlatform = options?.targetPlatform;
  if (targetPlatform && !SUPPORTED_PLATFORMS.has(targetPlatform)) throw new Error(`Unsupported target platform: ${targetPlatform}.`);
  if (!result.readyForMaterialize) {
    const blockers = result.diagnostics.filter((item) => item.severity === "error" || item.blocks.includes("materialize"));
    const first = blockers[0] ?? diagnostic("error", "no-materializable-targets", "/targets", "Recipe has no reusable installer targets.");
    throw new Error(`${first.path}: ${first.message}`);
  }
  const downloads = targetPlatform
    ? result.materializableTargets.filter((target) => target.platform === targetPlatform)
    : result.materializableTargets;
  if (downloads.length === 0) throw new Error(`No reusable installer target exists for ${targetPlatform}.`);
  const skipped = recipe.targets
    .filter((target) => target.packaging !== "reuse-installer" || (targetPlatform && target.platform !== targetPlatform))
    .map((target) => ({
      platform: target.platform,
      packaging: target.packaging,
      reason: target.packaging !== "reuse-installer" ? "This worker only materializes reusable installers." : `Not selected; materialization was limited to ${targetPlatform}.`
    }));
  return {
    schemaVersion: 1,
    source: {
      repository: recipe.source.repository,
      commit: recipe.source.commit,
      ...(recipe.source.license ? { license: recipe.source.license } : {})
    },
    downloads,
    skipped
  };
}

export function createBuildPlan(recipe, targetPlatform, options) {
  const result = validateRecipe(recipe, options);
  const target = result.buildableTargets.find((item) => item.platform === targetPlatform);
  if (!result.readyForBuild || !target) {
    const blockers = result.diagnostics.filter((item) => item.severity === "error" || item.blocks.includes("build"));
    const first = blockers[0] ?? diagnostic("error", "build-target-unavailable", "/targets", `No reviewed source-build target exists for ${targetPlatform}.`);
    throw new Error(`${first.path}: ${first.message}`);
  }
  return {
    schemaVersion: 1,
    source: {
      repository: recipe.source.repository,
      commit: recipe.source.commit,
      ...(recipe.source.license ? { license: recipe.source.license } : {})
    },
    application: { name: recipe.application.name, entrypoint: recipe.application.entrypoint },
    target
  };
}

export function formatValidationReport(result, format = "text") {
  if (format === "json") return JSON.stringify(result, null, 2);
  const lines = [
    `Recipe structure: ${result.valid ? "valid" : "invalid"}`,
    `Materialize existing installers: ${result.readyForMaterialize ? "ready" : "not ready"}`,
    `Reviewed source build: ${result.readyForBuild ? "ready" : "not ready"}`
  ];
  for (const item of result.diagnostics) lines.push(`${item.severity.toUpperCase()} ${item.path} [${item.code}]: ${item.message}`);
  return lines.join("\n");
}