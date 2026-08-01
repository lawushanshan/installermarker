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
    analysis: { project: { kind: "electron", strategy: "electron", artifactDirectories: ["dist", "out"], suggestedBuildCommand: "npm ci && npm run dist" } },
    targets: [{ id: "windows-x64", status: "likely", artifact: null }]
  };
  const recipe = createRecipe(report);
  assert.equal(recipe.targets[0].packaging, "build-electron");
  assert.deepEqual(recipe.build.artifactDirectories, ["dist", "out"]);
  assert.equal(recipe.build.suggestedCommand, "npm ci && npm run dist");
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