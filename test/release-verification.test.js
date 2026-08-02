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
import { formatReleaseVerification, verifyReleaseEvidence } from "../src/release-verification.js";

const run = promisify(execFile);

function artifact(size = 13, sha256 = "b".repeat(64)) {
  return {
    platform: "windows-x64",
    name: "widget.msi",
    size,
    sha256
  };
}

function source() {
  return {
    repository: "https://github.com/acme/widget",
    commit: "a".repeat(40),
    license: "MIT"
  };
}

function verification(size = 13, sha256 = "b".repeat(64)) {
  return {
    valid: true,
    manifest: "artifacts.json",
    source: source(),
    artifacts: [artifact(size, sha256)],
    manifestData: {
      artifacts: [{
        ...artifact(size, sha256),
        sourceUrl: "https://github.com/acme/widget/releases/download/v1/widget.msi"
      }]
    }
  };
}

function smokeResult(size = 13, sha256 = "b".repeat(64)) {
  return {
    schemaVersion: 1,
    generatedAt: "2026-01-01T00:00:00.000Z",
    runner: { name: "isolated-smoke-runner", version: "1.0.0", platform: "windows-x64" },
    source: source(),
    manifest: { name: "artifacts.json" },
    execution: {
      mode: "external-isolated-smoke-runner",
      boundary: "Runner received only verified artifacts and smoke plans."
    },
    results: [{
      artifact: artifact(size, sha256),
      installerType: "msi",
      runOn: "windows-x64",
      verdict: "passed",
      steps: [
        { name: "prepare-isolated-host", status: "passed" },
        { name: "install", status: "passed" },
        { name: "launch", status: "passed" },
        { name: "uninstall", status: "passed" }
      ]
    }],
    summary: { verdict: "passed", passed: 1, failed: 0, inconclusive: 0 }
  };
}

function scanResult(size = 13, sha256 = "b".repeat(64)) {
  return {
    schemaVersion: 1,
    generatedAt: "2026-01-01T00:00:00.000Z",
    scanner: { name: "approved-static-scanner", version: "1.0.0", policy: "installer-release-gate" },
    source: source(),
    manifest: { name: "artifacts.json" },
    execution: {
      mode: "external-approved-scanner",
      boundary: "Scanner received only verified artifacts and scan requests."
    },
    results: [{
      artifact: artifact(size, sha256),
      artifactType: "windows-installer",
      verdict: "passed",
      stages: [
        { name: "hash-reputation-lookup", status: "passed" },
        { name: "static-malware-scan", status: "passed" }
      ]
    }],
    summary: { verdict: "passed", passed: 1, failed: 0, inconclusive: 0 }
  };
}

function signResult(size = 13, sha256 = "b".repeat(64)) {
  return {
    schemaVersion: 1,
    generatedAt: "2026-01-01T00:00:00.000Z",
    signer: { name: "protected-release-signer", version: "1.0.0", policy: "installer-release-gate" },
    source: source(),
    manifest: { name: "artifacts.json" },
    execution: {
      mode: "external-protected-signing-service",
      boundary: "Signer received only verified artifacts and signing requests."
    },
    results: [{
      artifact: artifact(size, sha256),
      profile: "windows-authenticode",
      verdict: "passed",
      stages: [
        { name: "submit-to-protected-signer", status: "passed" },
        { name: "authenticode-sign", status: "passed" },
        { name: "authenticode-verify", status: "passed" }
      ]
    }],
    summary: { verdict: "passed", passed: 1, failed: 0, inconclusive: 0 }
  };
}

function releaseInputs(size = 13, sha256 = "b".repeat(64)) {
  return {
    smokeResult: smokeResult(size, sha256),
    scanResult: scanResult(size, sha256),
    signResult: signResult(size, sha256)
  };
}

test("verifies complete release evidence from raw external results", () => {
  const report = verifyReleaseEvidence(verification(), releaseInputs(), { generatedAt: "2026-01-01T00:00:01.000Z" });
  assert.equal(report.valid, true);
  assert.equal(report.gates.length, 5);
  assert.equal(report.gates.every((gate) => gate.status === "passed"), true);
  assert.equal(report.evidence.smokeVerification.valid, true);
  assert.match(formatReleaseVerification(report, "text"), /Release verification: valid/);
});

test("release verification reports satisfy the schema contract", async () => {
  const schema = JSON.parse(await readFile(new URL("../schema/release-verification.schema.json", import.meta.url), "utf8"));
  const ajv = new Ajv2020({ strict: true });
  addFormats(ajv);
  const validate = ajv.compile(schema);
  assert.equal(validate(verifyReleaseEvidence(verification(), releaseInputs(), { generatedAt: "2026-01-01T00:00:01.000Z" })), true);
});

test("rejects release evidence when one external gate fails", () => {
  const inputs = releaseInputs();
  inputs.scanResult.results[0].stages[1].status = "failed";
  inputs.scanResult.results[0].verdict = "failed";
  inputs.scanResult.summary = { verdict: "failed", passed: 0, failed: 1, inconclusive: 0 };
  const report = verifyReleaseEvidence(verification(), inputs, { generatedAt: "2026-01-01T00:00:01.000Z" });
  assert.equal(report.valid, false);
  assert.equal(report.gates.find((gate) => gate.name === "artifact-scan").status, "failed");
  assert.equal(report.errors.some((error) => error.code === "release-scan-verification-failed"), true);
});

test("release-verify command emits JSON for verified artifact directories and raw results", async () => {
  const directory = await mkdtemp(join(tmpdir(), "installermarker-release-verify-"));
  const payload = Buffer.from("installer data");
  const sha256 = createHash("sha256").update(payload).digest("hex");
  try {
    await writeFile(join(directory, "widget.msi"), payload);
    await writeFile(join(directory, "artifacts.json"), `${JSON.stringify({
      schemaVersion: 1,
      source: source(),
      artifacts: [{
        ...artifact(payload.length, sha256),
        sourceUrl: "https://github.com/acme/widget/releases/download/v1/widget.msi"
      }],
      skipped: []
    }, null, 2)}\n`);

    const smokePath = join(directory, "smoke-result.json");
    const scanPath = join(directory, "scan-result.json");
    const signPath = join(directory, "sign-result.json");
    const smoke = smokeResult(payload.length, sha256);
    const scan = scanResult(payload.length, sha256);
    const sign = signResult(payload.length, sha256);
    await writeFile(smokePath, `${JSON.stringify(smoke, null, 2)}\n`);
    await writeFile(scanPath, `${JSON.stringify(scan, null, 2)}\n`);
    await writeFile(signPath, `${JSON.stringify(sign, null, 2)}\n`);

    const output = await run(process.execPath, ["./bin/installermarker.js", "release-verify", directory, "--smoke-result", smokePath, "--scan-result", scanPath, "--sign-result", signPath, "--json"], { cwd: process.cwd() });
    const report = JSON.parse(output.stdout);
    assert.equal(report.valid, true);

    scan.results[0].verdict = "failed";
    scan.results[0].stages[1].status = "failed";
    scan.summary = { verdict: "failed", passed: 0, failed: 1, inconclusive: 0 };
    await writeFile(scanPath, `${JSON.stringify(scan, null, 2)}\n`);
    await assert.rejects(() => run(process.execPath, ["./bin/installermarker.js", "release-verify", directory, "--smoke-result", smokePath, "--scan-result", scanPath, "--sign-result", signPath, "--json"], { cwd: process.cwd() }), /Command failed/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
