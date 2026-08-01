import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);

function recipe(entrypoint = "widget") {
  const payload = Buffer.from("installer");
  return {
    schemaVersion: 1,
    source: { repository: "https://github.com/acme/widget", branch: "main", commit: "a".repeat(40) },
    application: { name: "widget", entrypoint },
    build: { strategy: "reuse-release", command: entrypoint.startsWith("TODO:") ? "TODO: confirm reproducible build command" : "none" },
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
    review: []
  };
}

test("validate command reports readiness and supports strict CI mode", async () => {
  const directory = await mkdtemp(join(tmpdir(), "installermarker-cli-"));
  const file = join(directory, "recipe.json");
  try {
    await writeFile(file, JSON.stringify(recipe()));
    const pass = await run(process.execPath, ["./bin/installermarker.js", "validate", file], { cwd: process.cwd() });
    assert.match(pass.stdout, /Recipe structure: valid/);
    assert.match(pass.stdout, /Materialize existing installers: ready/);

    await writeFile(file, JSON.stringify(recipe("TODO: confirm executable entrypoint")));
    await assert.rejects(() => run(process.execPath, ["./bin/installermarker.js", "validate", file, "--strict"], { cwd: process.cwd() }), (error) => {
      assert.equal(error.code, 1);
      assert.match(error.stdout, /WARNING/);
      return true;
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("validate command reads YAML recipes and enforces a configured recipe root", async () => {
  const directory = await mkdtemp(join(tmpdir(), "installermarker-cli-"));
  const recipes = join(directory, "recipes");
  const yamlFile = join(recipes, "recipe.yaml");
  const outsideFile = join(directory, "outside.yaml");
  const yaml = `schemaVersion: 1
source:
  repository: https://github.com/acme/widget
  branch: main
  commit: ${"a".repeat(40)}
application:
  name: widget
  entrypoint: widget
build:
  strategy: reuse-release
  command: none
targets:
  - platform: windows-x64
    status: available
    packaging: reuse-installer
    input:
      name: widget-amd64.msi
      url: https://github.com/acme/widget/releases/download/v1.0.0/widget-amd64.msi
      size: 9
      digest: sha256:${createHash("sha256").update("installer").digest("hex")}
review: []
`;
  try {
    await mkdir(recipes);
    await Promise.all([writeFile(yamlFile, yaml), writeFile(outsideFile, yaml)]);
    const pass = await run(process.execPath, ["./bin/installermarker.js", "validate", yamlFile, "--recipe-root", recipes], { cwd: process.cwd() });
    assert.match(pass.stdout, /Recipe structure: valid/);
    await assert.rejects(() => run(process.execPath, ["./bin/installermarker.js", "validate", outsideFile, "--recipe-root", recipes], { cwd: process.cwd() }), (error) => {
      assert.equal(error.code, 1);
      assert.match(error.stderr, /Recipe path must be inside the configured recipe root/);
      return true;
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("version command reports the installed package version", async () => {
  const result = await run(process.execPath, ["./bin/installermarker.js", "--version"], { cwd: process.cwd() });
  const { version } = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  assert.equal(result.stdout.trim(), version);
});
