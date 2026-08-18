import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createMaterializationPlan, validateRecipe } from "../src/validate.js";

function validRecipe(overrides = {}) {
  const payload = Buffer.from("installer");
  return {
    schemaVersion: 1,
    source: { repository: "https://github.com/acme/widget", branch: "main", commit: "a".repeat(40) },
    application: { name: "widget", entrypoint: "widget" },
    build: { strategy: "reuse-release", command: "none" },
    targets: [{
      platform: "windows-x64",
      status: "available",
      packaging: "reuse-installer",
      input: {
        name: "widget-amd64.msi",
        url: "https://github.com/acme/widget/releases/download/v1.0.0/widget-amd64.msi",
        size: payload.length,
        digest: `sha256:${createHash("sha256").update(payload).digest("hex")}`
      }
    }],
    review: [],
    ...overrides
  };
}

test("reports a verified reusable installer as materialization-ready", () => {
  const result = validateRecipe(validRecipe());
  assert.equal(result.valid, true);
  assert.equal(result.readyForMaterialize, true);
  assert.equal(result.materializableTargets.length, 1);
});

test("keeps draft recipes valid while flagging unresolved worker requirements", () => {
  const recipe = validRecipe({
    application: { name: "widget", entrypoint: "TODO: confirm executable entrypoint" },
    build: { strategy: "go-native", command: "TODO: confirm reproducible build command" },
    targets: [{ platform: "linux-x64", status: "likely", packaging: "TODO: select packager" }]
  });
  const result = validateRecipe(recipe);
  assert.equal(result.valid, true);
  assert.equal(result.readyForMaterialize, false);
  assert.equal(result.warnings.length, 3);
});

test("rejects schema violations before worker validation", () => {
  const recipe = validRecipe({ schemaVersion: 2 });
  const result = validateRecipe(recipe);
  assert.equal(result.valid, false);
  assert.equal(result.errors[0].code, "schema-const");
});

test("does not block valid targets because another target needs wrapping", () => {
  const recipe = validRecipe();
  recipe.targets.push({
    platform: "linux-x64",
    status: "available",
    packaging: "wrap-release-asset",
    input: { name: "widget-linux.tar.gz", url: "https://github.com/acme/widget/releases/download/v1/widget-linux.tar.gz", size: 1, digest: null }
  });
  const result = validateRecipe(recipe);
  assert.equal(result.valid, true);
  assert.equal(result.readyForMaterialize, true);
  assert.equal(result.warnings.some((item) => item.code === "materialization-unavailable"), true);
});

test("limits a materialization plan to a requested reusable platform", () => {
  const recipe = validRecipe();
  recipe.targets.push({
    platform: "linux-x64",
    status: "available",
    packaging: "reuse-installer",
    input: { name: "widget.deb", url: "https://github.com/acme/widget/releases/download/v1/widget.deb", size: 1, digest: `sha256:${"a".repeat(64)}` }
  });
  const plan = createMaterializationPlan(recipe, { targetPlatform: "linux-x64" });
  assert.deepEqual(plan.downloads.map((item) => item.platform), ["linux-x64"]);
  assert.equal(plan.skipped.some((item) => item.platform === "windows-x64"), true);
});

test("rejects duplicate platforms before a worker can overwrite staging output", () => {
  const recipe = validRecipe();
  recipe.targets.push({ ...recipe.targets[0] });
  const result = validateRecipe(recipe);
  assert.equal(result.valid, false);
  assert.equal(result.errors.some((item) => item.code === "duplicate-platform"), true);
});

test("allows reviewed Go, Rust, and Python native installer build plans", () => {
  for (const strategy of ["go-native", "rust-native", "python-native"]) {
    const recipe = validRecipe({
      build: { strategy, command: "reviewed-native-packager", artifactDirectories: ["packages"] },
      targets: [{ platform: "linux-x64", status: "likely", packaging: "build-native" }]
    });
    const result = validateRecipe(recipe);
    assert.equal(result.readyForBuild, true);
    assert.equal(result.buildableTargets[0].strategy, strategy);
  }
});

test("accepts structured suggested packager hints in native build recipes", () => {
  const recipe = validRecipe({
    build: {
      strategy: "python-native",
      command: "reviewed-native-packager",
      artifactDirectories: ["packages"],
      suggestedPackager: "briefcase"
    },
    targets: [{ platform: "linux-x64", status: "likely", packaging: "build-native" }]
  });
  const result = validateRecipe(recipe);
  assert.equal(result.valid, true);
  assert.equal(result.readyForBuild, true);
});

test("rejects native build targets that do not declare a native strategy", () => {
  const recipe = validRecipe({
    build: { strategy: "electron", command: "reviewed-native-packager", artifactDirectories: ["packages"] },
    targets: [{ platform: "linux-x64", status: "likely", packaging: "build-native" }]
  });
  const result = validateRecipe(recipe);
  assert.equal(result.readyForBuild, false);
  assert.equal(result.errors.some((item) => item.code === "native-build-strategy-invalid"), true);
});

test("keeps native build drafts valid while blocking execution pending packaging review", () => {
  const recipe = validRecipe({
    build: { strategy: "go-native", command: "TODO: review native packaging command", artifactDirectories: [] },
    targets: [{ platform: "linux-x64", status: "likely", packaging: "build-native" }]
  });
  const result = validateRecipe(recipe);
  assert.equal(result.valid, true);
  assert.equal(result.readyForBuild, false);
  assert.equal(result.warnings.some((item) => item.code === "artifact-directories-missing"), true);
});

test("warns when a recipe has no SPDX license evidence", () => {
  const recipe = validRecipe();
  recipe.source.license = "NOASSERTION";
  const result = validateRecipe(recipe);
  assert.equal(result.valid, true);
  assert.equal(result.warnings.some((item) => item.code === "license-unresolved"), true);
});