import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { inspectLocalProject, packageProject } from "../src/local-build.js";

const hostTarget = process.platform === "darwin" ? "macos-universal" : process.platform === "win32" ? "windows-x64" : "linux-x64";
const hostPackage = hostTarget === "macos-universal" ? "widget.dmg" : hostTarget === "windows-x64" ? "widget.exe" : "widget.AppImage";

test("detects a local Electron package command and artifact directories", async () => {
  const directory = await mkdtemp(join(tmpdir(), "installermarker-local-test-"));
  try {
    await writeFile(join(directory, "package.json"), JSON.stringify({
      devDependencies: { electron: "^30.0.0", "electron-builder": "^24.0.0" },
      scripts: { build: "vite build", compile: "npm run build && electron-builder build" }
    }));
    const result = await inspectLocalProject(directory);
    assert.equal(result.project.kind, "electron");
    assert.equal(result.suggestedBuildCommand, "npm install && npm run compile");
    assert.deepEqual(result.artifactDirectories, ["dist", "out"]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("uses the declared package manager for local Tauri builds", async () => {
  const directory = await mkdtemp(join(tmpdir(), "installermarker-local-test-"));
  try {
    await mkdir(join(directory, "src-tauri"));
    await writeFile(join(directory, "src-tauri", "tauri.conf.json"), "{}");
    await writeFile(join(directory, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n");
    await writeFile(join(directory, "package.json"), JSON.stringify({
      packageManager: "pnpm@9.15.0",
      devDependencies: { "@tauri-apps/cli": "^2.0.0" },
      scripts: { build: "vite build", tauri: "tauri" }
    }));
    const result = await inspectLocalProject(directory);
    assert.equal(result.project.kind, "tauri");
    assert.equal(result.suggestedBuildCommand, "pnpm install --frozen-lockfile && pnpm run tauri -- build");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("packages local build output and writes hashes", async () => {
  const directory = await mkdtemp(join(tmpdir(), "installermarker-local-test-"));
  const output = join(directory, "deliverables");
  try {
    await writeFile(join(directory, "package.json"), JSON.stringify({
      devDependencies: { electron: "^30.0.0" },
      scripts: { dist: "pack" }
    }));
    const manifest = await packageProject(directory, {
      targetPlatform: hostTarget,
      outputDir: output,
      run: async (_command, _args, options) => {
        await mkdir(join(options.cwd, "dist"), { recursive: true });
        await writeFile(join(options.cwd, "dist", hostPackage), "package bytes");
      }
    });
    assert.equal(manifest.artifacts[0].name, hostPackage);
    assert.equal(manifest.artifacts[0].sha256.length, 64);
    assert.equal(await readFile(join(output, hostPackage), "utf8"), "package bytes");
    assert.equal(JSON.parse(await readFile(join(output, "package-manifest.json"), "utf8")).artifacts.length, 1);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("supports explicit artifact directories and dry-run without executing", async () => {
  const directory = await mkdtemp(join(tmpdir(), "installermarker-local-test-"));
  try {
    await writeFile(join(directory, "package.json"), JSON.stringify({ scripts: { build: "pack" } }));
    const plan = await packageProject(directory, {
      targetPlatform: hostTarget,
      command: "custom-pack",
      artifactDirectories: ["release"],
      dryRun: true,
      run: async () => { throw new Error("must not execute"); }
    });
    assert.equal(plan.command, "custom-pack");
    assert.deepEqual(plan.artifactDirectories, ["release"]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
