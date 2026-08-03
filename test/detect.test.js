import test from "node:test";
import assert from "node:assert/strict";
import { classifyTargets, detectProject } from "../src/detect.js";

test("detects Electron from package.json", () => {
  const project = detectProject([{ path: "package.json", content: JSON.stringify({ devDependencies: { electron: "^30.0.0" } }) }]);
  assert.equal(project.kind, "electron");
  assert.equal(project.strategy, "electron");
  assert.deepEqual(project.artifactDirectories, ["dist", "out"]);
});

test("suggests Electron packaging tools when manifests name one", () => {
  const project = detectProject([{
    path: "package.json",
    content: JSON.stringify({ devDependencies: { electron: "^30.0.0", "electron-builder": "^24.0.0" }, scripts: { dist: "electron-builder" } })
  }]);
  assert.equal(project.kind, "electron");
  assert.equal(project.suggestedPackager, "electron-builder");
  assert.equal(project.suggestedBuildCommand, "npm ci && npm run dist");
});

test("detects Python projects as reviewed native-build candidates", () => {
  const project = detectProject([{ path: "pyproject.toml", content: "[project]\nname = 'widget'\n" }]);
  assert.equal(project.kind, "python");
  assert.equal(project.strategy, "python-native");
  assert.deepEqual(project.artifactDirectories, ["dist", "build"]);
  assert.deepEqual(classifyTargets([], project).map((target) => target.status), ["likely", "likely", "likely"]);
});

test("suggests Python packagers when manifests already name one", async (t) => {
  const cases = [
    {
      name: "briefcase in pyproject",
      files: [{ path: "pyproject.toml", content: "[project]\nname = 'widget'\ndependencies = ['briefcase']\n" }],
      packager: "briefcase",
      command: "python -m pip install briefcase && briefcase build"
    },
    {
      name: "pyinstaller in requirements",
      files: [{ path: "requirements.txt", content: "PyInstaller==6.16.0\n" }],
      packager: "pyinstaller",
      command: "python -m pip install pyinstaller && pyinstaller TODO: confirm executable entrypoint"
    },
    {
      name: "nuitka in setup.py",
      files: [{ path: "setup.py", content: "install_requires=['Nuitka']\n" }],
      packager: "nuitka",
      command: "python -m pip install nuitka && python -m nuitka --standalone TODO: confirm executable entrypoint"
    },
    {
      name: "cx_Freeze in pyproject",
      files: [{ path: "pyproject.toml", content: "[project]\nname = 'widget'\ndependencies = ['Cx_Freeze']\n" }],
      packager: "cx_Freeze",
      command: "python -m pip install cx_Freeze && python setup.py build"
    }
  ];

  for (const { name, files, packager, command } of cases) {
    await t.test(name, () => {
      const project = detectProject(files);
      assert.equal(project.kind, "python");
      assert.equal(project.suggestedPackager, packager);
      assert.equal(project.suggestedBuildCommand, command);
    });
  }
});

test("suggests Tauri packaging tools when manifests name the CLI", () => {
  const project = detectProject([
    { path: "package.json", content: JSON.stringify({ devDependencies: { "@tauri-apps/cli": "^2.0.0" }, scripts: { build: "vite build" } }) },
    { path: "src-tauri/tauri.conf.json", content: "{}" }
  ]);
  assert.equal(project.kind, "tauri");
  assert.equal(project.suggestedPackager, "tauri-cli");
  assert.equal(project.suggestedBuildCommand, "npm ci && npm run build && npm run tauri -- build");
});

test("release assets override inferred target support", () => {
  const targets = classifyTargets([{ name: "widget-1.0.0-win-x64.msi" }, { name: "widget-1.0.0-macos.dmg" }, { name: "widget-1.0.0.AppImage" }], { kind: "unknown" });
  assert.deepEqual(targets.map((target) => target.status), ["available", "available", "available"]);
  assert.deepEqual(targets.map((target) => target.artifact), ["installer", "installer", "installer"]);
});

test("an archive is available but still needs installer wrapping", () => {
  const [target] = classifyTargets([{ name: "widget-macos-arm64.zip" }], { kind: "unknown" }).filter((item) => item.id === "macos-universal");
  assert.equal(target.status, "available");
  assert.equal(target.artifact, "release-asset");
});

test("x64 targets never select 386 or arm64 assets", () => {
  const assets = [
    { name: "widget_windows_386.msi" },
    { name: "widget_windows_arm64.msi" },
    { name: "widget_windows_amd64.msi" },
    { name: "widget_linux_386.deb" },
    { name: "widget_linux_arm64.deb" },
    { name: "widget_linux_amd64.deb" }
  ];
  const targets = classifyTargets(assets, { kind: "unknown" });
  assert.equal(targets.find((target) => target.id === "windows-x64").selectedAsset.name, "widget_windows_amd64.msi");
  assert.equal(targets.find((target) => target.id === "linux-x64").selectedAsset.name, "widget_linux_amd64.deb");
});

test("universal macOS assets are preferred over architecture-specific assets", () => {
  const targets = classifyTargets([
    { name: "widget_macOS_arm64.pkg" },
    { name: "widget_macOS_x86_64.pkg" },
    { name: "widget_macOS_universal.pkg" }
  ], { kind: "unknown" });
  assert.equal(targets.find((target) => target.id === "macos-universal").selectedAsset.name, "widget_macOS_universal.pkg");
});

test("unknown projects require manual target review", () => {
  const targets = classifyTargets([], { kind: "unknown" });
  assert.deepEqual(targets.map((target) => target.status), ["needs_review", "needs_review", "needs_review"]);
});
