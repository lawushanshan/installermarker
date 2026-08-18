import test from "node:test";
import assert from "node:assert/strict";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { createArtifactSbom, formatArtifactSbom } from "../src/sbom.js";

const run = promisify(execFile);

function materializedVerification() {
  return {
    manifest: "artifacts.json",
    source: {
      repository: "https://github.com/acme/widget",
      commit: "a".repeat(40),
      license: "MIT"
    },
    artifacts: [{
      platform: "windows-x64",
      name: "widget.msi",
      size: 11,
      sha256: "b".repeat(64)
    }],
    manifestData: {
      artifacts: [{
        sourceUrl: "https://github.com/acme/widget/releases/download/v1/widget.msi"
      }]
    }
  };
}

function buildVerification() {
  return {
    manifest: "build-artifacts.json",
    source: {
      repository: "https://github.com/acme/widget",
      commit: "a".repeat(40)
    },
    artifacts: [{
      platform: "linux-x64",
      name: "widget.deb",
      size: 12,
      sha256: "c".repeat(64)
    }],
    sbomDocuments: [{
      name: "widget.spdx.json",
      format: "spdx",
      size: 22,
      sha256: "d".repeat(64),
      sourcePath: "packages/widget.spdx.json"
    }],
    manifestData: {
      build: {
        strategy: "go-native",
        command: "reviewed-native-packager",
        platform: "linux-x64"
      },
      provenance: {
        startedAt: "2026-01-01T00:00:00.000Z",
        finishedAt: "2026-01-01T00:00:01.000Z",
        durationMs: 1000,
        runner: {
          nodeVersion: "v22.0.0",
          platform: "linux",
          arch: "x64"
        }
      },
      artifacts: [{
        sourcePath: "packages/widget.deb"
      }],
      sbom: {
        documents: [{
          name: "widget.spdx.json",
          format: "spdx",
          size: 22,
          sha256: "d".repeat(64),
          sourcePath: "packages/widget.spdx.json"
        }]
      }
    }
  };
}

test("projects verified materialized artifacts into an SBOM", () => {
  const sbom = createArtifactSbom(materializedVerification(), { generatedAt: "2026-01-01T00:00:00.000Z" });
  assert.equal(sbom.bomFormat, "InstallerMarker");
  assert.equal(sbom.manifest.name, "artifacts.json");
  assert.equal(sbom.components[0].provenance.sourceUrl, "https://github.com/acme/widget/releases/download/v1/widget.msi");
  assert.match(formatArtifactSbom(sbom, "text"), /InstallerMarker SBOM/);
});

test("projects build artifacts into an SBOM with source paths", () => {
  const sbom = createArtifactSbom(buildVerification(), { generatedAt: "2026-01-01T00:00:00.000Z" });
  assert.equal(sbom.manifest.build.strategy, "go-native");
  assert.equal(sbom.manifest.provenance.runner.platform, "linux");
  assert.equal(sbom.components[0].provenance.sourcePath, "packages/widget.deb");
  assert.equal(sbom.documents[0].name, "widget.spdx.json");
  assert.match(formatArtifactSbom(sbom, "text"), /Runner: Node v22\.0\.0 on linux\/x64/);
  assert.match(formatArtifactSbom(sbom, "text"), /Build SBOM documents: 1/);
});

test("generated SBOMs satisfy the schema contract", async () => {
  const schema = JSON.parse(await readFile(new URL("../schema/sbom.schema.json", import.meta.url), "utf8"));
  const ajv = new Ajv2020({ strict: true });
  addFormats(ajv);
  const validate = ajv.compile(schema);
  assert.equal(validate(createArtifactSbom(materializedVerification(), { generatedAt: "2026-01-01T00:00:00.000Z" })), true);
  assert.equal(validate(createArtifactSbom(buildVerification(), { generatedAt: "2026-01-01T00:00:00.000Z" })), true);
});

test("sbom command emits JSON for a verified materialized directory", async () => {
  const directory = await mkdtemp(join(tmpdir(), "installermarker-sbom-"));
  const payload = Buffer.from("installer bytes");
  const sha256 = createHash("sha256").update(payload).digest("hex");
  try {
    await writeFile(join(directory, "widget.msi"), payload);
    await writeFile(join(directory, "artifacts.json"), `${JSON.stringify({
      schemaVersion: 1,
      source: {
        repository: "https://github.com/acme/widget",
        commit: "a".repeat(40),
        license: "MIT"
      },
      artifacts: [{
        platform: "windows-x64",
        name: "widget.msi",
        size: payload.length,
        sha256,
        sourceUrl: "https://github.com/acme/widget/releases/download/v1/widget.msi"
      }],
      skipped: []
    }, null, 2)}\n`);
    const result = await run(process.execPath, ["./bin/installermarker.js", "sbom", directory, "--json"], { cwd: process.cwd() });
    const sbom = JSON.parse(result.stdout);
    assert.equal(sbom.manifest.name, "artifacts.json");
    assert.equal(sbom.components[0].provenance.sourceUrl, "https://github.com/acme/widget/releases/download/v1/widget.msi");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
