import test from "node:test";
import assert from "node:assert/strict";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { formatGateVerification, verifyGateDirectory } from "../src/gate.js";
import { createReleasePlan } from "../src/release-plan.js";
import { createScanPlan } from "../src/scan.js";
import { createSigningPlan } from "../src/signing.js";
import { createArtifactSbom } from "../src/sbom.js";
import { createSmokePlan } from "../src/smoke.js";

const run = promisify(execFile);

function verification() {
  return {
    manifest: "build-artifacts.json",
    source: {
      repository: "https://github.com/acme/widget",
      commit: "a".repeat(40)
    },
    artifacts: [{
      platform: "linux-x64",
      name: "widget.AppImage",
      size: 13,
      sha256: "d".repeat(64)
    }],
    sbomDocuments: [{
      name: "widget.spdx.json",
      format: "spdx",
      size: 22,
      sha256: "e".repeat(64),
      sourcePath: "dist/widget.spdx.json"
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
        platform: "linux-x64",
        name: "widget.AppImage",
        size: 13,
        sha256: "d".repeat(64),
        sourcePath: "dist/widget.AppImage"
      }],
      sbom: {
        documents: [{
          name: "widget.spdx.json",
          format: "spdx",
          size: 22,
          sha256: "e".repeat(64),
          sourcePath: "dist/widget.spdx.json"
        }]
      }
    }
  };
}

async function writeGateBundle(directory, verified = verification()) {
  const generatedAt = "2026-01-01T00:00:00.000Z";
  await writeFile(join(directory, "verify.json"), `${JSON.stringify({
    valid: true,
    manifest: verified.manifest,
    source: verified.source,
    artifacts: verified.artifacts,
    sbomDocuments: verified.sbomDocuments
  }, null, 2)}\n`);
  await writeFile(join(directory, "sbom.json"), `${JSON.stringify(createArtifactSbom(verified, { generatedAt }), null, 2)}\n`);
  await writeFile(join(directory, "smoke-plan.json"), `${JSON.stringify(createSmokePlan(verified, { generatedAt }), null, 2)}\n`);
  await writeFile(join(directory, "scan-plan.json"), `${JSON.stringify(createScanPlan(verified, { generatedAt }), null, 2)}\n`);
  await writeFile(join(directory, "sign-plan.json"), `${JSON.stringify(createSigningPlan(verified, { generatedAt }), null, 2)}\n`);
  await writeFile(join(directory, "release-plan.json"), `${JSON.stringify(createReleasePlan(verified, { generatedAt }), null, 2)}\n`);
}

test("verifies a complete release gate bundle", async () => {
  const directory = await mkdtemp(join(tmpdir(), "installermarker-gate-"));
  try {
    await writeGateBundle(directory);
    const report = await verifyGateDirectory(directory, { generatedAt: "2026-01-01T00:00:01.000Z" });
    assert.equal(report.valid, true);
    assert.equal(report.artifactCount, 1);
    assert.equal(report.sbomDocumentCount, 1);
    assert.equal(report.checks.every((check) => check.status === "passed"), true);
    assert.match(formatGateVerification(report, "text"), /Release gate bundle: valid/);

    const schema = JSON.parse(await readFile(new URL("../schema/gate-verification.schema.json", import.meta.url), "utf8"));
    const ajv = new Ajv2020({ strict: true });
    addFormats(ajv);
    assert.equal(ajv.compile(schema)(report), true);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("gate-verify command emits JSON for a valid gate bundle", async () => {
  const directory = await mkdtemp(join(tmpdir(), "installermarker-gate-"));
  try {
    await writeGateBundle(directory);
    const result = await run(process.execPath, ["./bin/installermarker.js", "gate-verify", directory, "--json"], { cwd: process.cwd() });
    const report = JSON.parse(result.stdout);
    assert.equal(report.valid, true);
    assert.equal(report.checks.some((check) => check.name === "release-gates"), true);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("rejects an inconsistent release gate bundle", async () => {
  const directory = await mkdtemp(join(tmpdir(), "installermarker-gate-"));
  try {
    await writeGateBundle(directory);
    const scanPlan = JSON.parse(await readFile(join(directory, "scan-plan.json"), "utf8"));
    scanPlan.requests[0].artifact.sha256 = "f".repeat(64);
    await writeFile(join(directory, "scan-plan.json"), `${JSON.stringify(scanPlan, null, 2)}\n`);
    const report = await verifyGateDirectory(directory, { generatedAt: "2026-01-01T00:00:01.000Z" });
    assert.equal(report.valid, false);
    assert.equal(report.errors.some((error) => error.code === "gate-artifact-mismatch"), true);
    await assert.rejects(() => run(process.execPath, ["./bin/installermarker.js", "gate-verify", directory, "--json"], { cwd: process.cwd() }), /Command failed/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
