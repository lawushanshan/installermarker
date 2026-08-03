import test from "node:test";
import assert from "node:assert/strict";
import { createRecipe } from "../src/recipe.js";

test("pins recipes to a commit and preserves selected artifact provenance", () => {
  const report = {
    source: { url: "https://github.com/acme/widget", defaultBranch: "main", commitSha: "a".repeat(40) },
    application: { name: "widget" },
    analysis: { project: { strategy: "go-native" } },
    targets: [{
      id: "windows-x64",
      status: "available",
      artifact: "installer",
      selectedAsset: { name: "widget.msi", url: "https://example.test/widget.msi", size: 10, digest: "sha256:abc" }
    }]
  };

  const recipe = createRecipe(report);
  assert.equal(recipe.source.commit, "a".repeat(40));
  assert.equal(recipe.targets[0].packaging, "reuse-installer");
  assert.equal(recipe.targets[0].input.digest, "sha256:abc");
  assert.equal(recipe.review.some((item) => item.includes("Calculate")), false);
});

test("requires digest review when GitHub does not publish one", () => {
  const report = {
    source: { url: "https://github.com/acme/widget", defaultBranch: "main", commitSha: "a".repeat(40) },
    application: { name: "widget" },
    analysis: { project: { strategy: "manual" } },
    targets: [{ id: "linux-x64", status: "available", artifact: "release-asset", selectedAsset: { name: "widget.tar.gz", url: "https://example.test/widget.tar.gz", size: 10, digest: null } }]
  };

  assert.equal(createRecipe(report).review.some((item) => item.includes("SHA-256")), true);
});

test("preserves SPDX license evidence and flags an unknown source license for review", () => {
  const report = {
    source: { url: "https://github.com/acme/widget", defaultBranch: "main", commitSha: "a".repeat(40), license: "NOASSERTION" },
    application: { name: "widget" },
    analysis: { project: { strategy: "manual" } },
    targets: [{ id: "linux-x64", status: "needs_review", artifact: null }]
  };
  const recipe = createRecipe(report);
  assert.equal(recipe.source.license, "NOASSERTION");
  assert.equal(recipe.review.some((item) => item.includes("redistribution permission")), true);
});

test("creates source-build targets for detected Electron projects", () => {
  const report = {
    source: { url: "https://github.com/acme/widget", defaultBranch: "main", commitSha: "a".repeat(40) },
    application: { name: "widget" },
    analysis: { project: { kind: "electron", strategy: "electron", artifactDirectories: ["dist", "out"], suggestedPackager: "electron-builder", suggestedBuildCommand: "npm ci && npm run dist" } },
    targets: [{ id: "windows-x64", status: "likely", artifact: null }]
  };
  const recipe = createRecipe(report);
  assert.equal(recipe.targets[0].packaging, "build-electron");
  assert.deepEqual(recipe.build.artifactDirectories, ["dist", "out"]);
  assert.equal(recipe.build.suggestedPackager, "electron-builder");
  assert.equal(recipe.build.suggestedCommand, "npm ci && npm run dist");
});

test("creates Tauri recipes with suggested packager commands when available", () => {
  const report = {
    source: { url: "https://github.com/acme/widget", defaultBranch: "main", commitSha: "a".repeat(40) },
    application: { name: "widget" },
    analysis: { project: { kind: "tauri", strategy: "tauri", artifactDirectories: ["src-tauri/target/release/bundle"], suggestedPackager: "tauri-cli", suggestedBuildCommand: "npm ci && npm run build && npm run tauri -- build" } },
    targets: [{ id: "linux-x64", status: "likely", artifact: null }]
  };
  const recipe = createRecipe(report);
  assert.equal(recipe.build.strategy, "tauri");
  assert.equal(recipe.build.suggestedPackager, "tauri-cli");
  assert.equal(recipe.build.suggestedCommand, "npm ci && npm run build && npm run tauri -- build");
  assert.equal(recipe.review.some((item) => item.includes("Review the suggested tauri-cli build command")), true);
});

test("creates Python recipes with suggested packager commands when available", () => {
  const report = {
    source: { url: "https://github.com/acme/widget", defaultBranch: "main", commitSha: "a".repeat(40) },
    application: { name: "widget" },
    analysis: { project: { kind: "python", strategy: "python-native", artifactDirectories: ["dist", "build"], suggestedPackager: "briefcase", suggestedBuildCommand: "python -m pip install briefcase && briefcase build" } },
    targets: [{ id: "linux-x64", status: "likely", artifact: null }]
  };
  const recipe = createRecipe(report);
  assert.equal(recipe.build.strategy, "python-native");
  assert.equal(recipe.build.suggestedPackager, "briefcase");
  assert.equal(recipe.build.suggestedCommand, "python -m pip install briefcase && briefcase build");
  assert.equal(recipe.review.some((item) => item.includes("Review the suggested briefcase build command")), true);
});

test("creates native-build targets for detected Go, Rust, and Python projects", () => {
  for (const kind of ["go", "rust", "python"]) {
    const report = {
      source: { url: "https://github.com/acme/widget", defaultBranch: "main", commitSha: "a".repeat(40) },
      application: { name: "widget" },
      analysis: { project: { kind, strategy: `${kind}-native`, ...(kind === "python" ? { artifactDirectories: ["dist", "build"] } : {}) } },
      targets: [{ id: "linux-x64", status: "likely", artifact: null }]
    };
    assert.equal(createRecipe(report).targets[0].packaging, "build-native");
  }
});
