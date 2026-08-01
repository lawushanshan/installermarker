const TARGETS = [
  { id: "windows-x64", label: "Windows x64", patterns: [/\.msi$/i, /\.exe$/i, /windows|win32|win64|win-/i], installer: /\.msi$/i },
  { id: "macos-universal", label: "macOS", patterns: [/\.dmg$/i, /\.pkg$/i, /macos|darwin|osx/i], installer: /\.(dmg|pkg)$/i },
  { id: "linux-x64", label: "Linux x64", patterns: [/\.appimage$/i, /\.deb$/i, /\.rpm$/i, /linux/i], installer: /\.(appimage|deb|rpm)$/i }
];

function isCompatibleArchitecture(name, targetId) {
  if (!targetId.endsWith("-x64")) return true;
  if (/(?:x86_64|x64|amd64)/i.test(name)) return true;
  if (/(?:arm64|aarch64|armv\d*)/i.test(name)) return false;
  return !/(?:^|[._-])(?:386|i[3-6]86|x86)(?:[._-]|$)/i.test(name);
}

function architectureScore(name, targetId) {
  if (targetId === "macos-universal" && /universal/i.test(name)) return 60;
  if (/(?:x86_64|x64|amd64)/i.test(name)) return 40;
  if (/(?:arm64|aarch64)/i.test(name)) return 30;
  return 10;
}

function packageJsonDetails(content) {
  try {
    const manifest = JSON.parse(content);
    const dependencies = { ...manifest.dependencies, ...manifest.devDependencies };
    const names = Object.keys(dependencies);
    const scripts = manifest.scripts ?? {};
    const suggestedBuildCommand = scripts.dist
      ? "npm ci && npm run dist"
      : scripts.make
        ? "npm ci && npm run make"
        : scripts.package
          ? "npm ci && npm run package"
          : scripts.build
            ? "npm ci && npm run build"
            : null;
    if (names.includes("electron") || names.includes("electron-builder") || names.includes("@electron-forge/cli")) {
      return {
        kind: "electron",
        strategy: "electron",
        evidence: "package.json declares Electron tooling",
        artifactDirectories: ["dist", "out"],
        suggestedBuildCommand
      };
    }
    return { kind: "node", strategy: "node", evidence: "package.json found" };
  } catch {
    return { kind: "node", strategy: "node", evidence: "package.json found but could not be parsed" };
  }
}

export function detectProject(files) {
  const paths = new Set(files.map((file) => file.path));
  const file = (path) => files.find((item) => item.path === path);
  if (paths.has("src-tauri/tauri.conf.json") || paths.has("src-tauri/tauri.conf.json5")) {
    const packageDetails = paths.has("package.json") ? packageJsonDetails(file("package.json")?.content ?? "") : null;
    const suggestedBuildCommand = packageDetails?.suggestedBuildCommand?.includes("npm run build")
      ? "npm ci && npm run build && npm run tauri -- build"
      : "npm ci && npm run tauri -- build";
    return {
      kind: "tauri",
      strategy: "tauri",
      evidence: "Tauri configuration found",
      artifactDirectories: ["src-tauri/target/release/bundle"],
      suggestedBuildCommand
    };
  }
  if (paths.has("package.json")) return packageJsonDetails(file("package.json")?.content ?? "");
  if (paths.has("go.mod")) return { kind: "go", strategy: "go-native", evidence: "go.mod found" };
  if (paths.has("Cargo.toml")) return { kind: "rust", strategy: "rust-native", evidence: "Cargo.toml found" };
  if (paths.has("pyproject.toml") || paths.has("requirements.txt") || paths.has("setup.py")) {
    return { kind: "python", strategy: "python-bundle", evidence: "Python project manifest found" };
  }
  if (paths.has("pom.xml") || paths.has("build.gradle") || paths.has("build.gradle.kts")) {
    return { kind: "java", strategy: "java-runtime", evidence: "Java build manifest found" };
  }
  if (paths.has("Dockerfile") || paths.has("compose.yaml") || paths.has("docker-compose.yml")) {
    return { kind: "container", strategy: "container-service", evidence: "Container configuration found" };
  }
  return { kind: "unknown", strategy: "manual", evidence: "No supported root manifest found" };
}

export function classifyTargets(releaseAssets, project) {
  return TARGETS.map((target) => {
    const { patterns, installer, ...identity } = target;
    const matchingAssets = releaseAssets
      .filter((asset) => patterns.some((pattern) => pattern.test(asset.name)))
      .filter((asset) => isCompatibleArchitecture(asset.name, target.id))
      .sort((left, right) => {
        const leftScore = (installer.test(left.name) ? 100 : 0) + architectureScore(left.name, target.id);
        const rightScore = (installer.test(right.name) ? 100 : 0) + architectureScore(right.name, target.id);
        return rightScore - leftScore || left.name.localeCompare(right.name);
      });
    if (matchingAssets.length) {
      const selectedAsset = matchingAssets[0];
      const artifact = installer.test(selectedAsset.name) ? "installer" : "release-asset";
      return {
        ...identity,
        status: "available",
        artifact,
        reason: artifact === "installer" ? `Installer asset available: ${selectedAsset.name}` : `Target release asset available: ${selectedAsset.name}`,
        selectedAsset,
        assets: matchingAssets
      };
    }
    if (["go", "rust", "electron", "tauri"].includes(project.kind)) {
      return { ...identity, status: "likely", artifact: null, reason: `${project.kind} commonly supports native cross-platform builds`, selectedAsset: null, assets: [] };
    }
    if (project.kind === "container") {
      return { ...identity, status: "needs_review", artifact: null, reason: "Package as a local service only after confirming its runtime and ports", selectedAsset: null, assets: [] };
    }
    return { ...identity, status: "needs_review", artifact: null, reason: "No target-specific release asset or verified cross-platform build signal", selectedAsset: null, assets: [] };
  });
}
