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
import { formatScanVerification, readScanResult, verifyScanResult } from "../src/scan-result.js";

const run = promisify(execFile);

function verification() {
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
      size: 13,
      sha256: "b".repeat(64)
    }],
    manifestData: {
      artifacts: [{
        platform: "windows-x64",
        name: "widget.msi",
        size: 13,
        sha256: "b".repeat(64),
        sourceUrl: "https://github.com/acme/widget/releases/download/v1/widget.msi"
      }]
    }
  };
}

function scanResult() {
  return {
    schemaVersion: 1,
    generatedAt: "2026-01-01T00:00:00.000Z",
    scanner: {
      name: "approved-static-scanner",
      version: "1.0.0",
      policy: "installer-release-gate"
    },
    source: {
      repository: "https://github.com/acme/widget",
      commit: "a".repeat(40),
      license: "MIT"
    },
    manifest: { name: "artifacts.json" },
    execution: {
      mode: "external-approved-scanner",
      boundary: "Scanner received only verified artifact bytes, hashes, and manifest metadata."
    },
    results: [{
      artifact: {
        platform: "windows-x64",
        name: "widget.msi",
        size: 13,
        sha256: "b".repeat(64)
      },
      artifactType: "windows-installer",
      verdict: "passed",
      stages: [
        { name: "hash-reputation-lookup", status: "passed", summary: "No known-bad reputation." },
        { name: "static-malware-scan", status: "passed", summary: "No detection." }
      ],
      scannerReference: "scan-123"
    }],
    summary: {
      verdict: "passed",
      passed: 1,
      failed: 0,
      inconclusive: 0
    }
  };
}

test("verifies an approved scanner result against verified artifacts", () => {
  const report = verifyScanResult(verification(), scanResult(), { generatedAt: "2026-01-01T00:00:01.000Z" });
  assert.equal(report.valid, true);
  assert.equal(report.scanner.name, "approved-static-scanner");
  assert.equal(report.summary.verdict, "passed");
  assert.equal(report.checks.every((check) => check.status === "passed"), true);
  assert.match(formatScanVerification(report, "text"), /Scan result verification: valid/);
});

test("scan verification reports satisfy the schema contract", async () => {
  const schema = JSON.parse(await readFile(new URL("../schema/scan-verification.schema.json", import.meta.url), "utf8"));
  const ajv = new Ajv2020({ strict: true });
  addFormats(ajv);
  const validate = ajv.compile(schema);
  assert.equal(validate(verifyScanResult(verification(), scanResult(), { generatedAt: "2026-01-01T00:00:01.000Z" })), true);
});

test("rejects scanner results that do not match verified artifact hashes", () => {
  const result = scanResult();
  result.results[0].artifact.sha256 = "c".repeat(64);
  const report = verifyScanResult(verification(), result, { generatedAt: "2026-01-01T00:00:01.000Z" });
  assert.equal(report.valid, false);
  assert.equal(report.errors.some((error) => error.code === "scan-artifact-mismatch"), true);
});

test("rejects scanner results with failed stages", () => {
  const result = scanResult();
  result.results[0].stages[0].status = "failed";
  result.results[0].verdict = "failed";
  result.summary = { verdict: "failed", passed: 0, failed: 1, inconclusive: 0 };
  const report = verifyScanResult(verification(), result, { generatedAt: "2026-01-01T00:00:01.000Z" });
  assert.equal(report.valid, false);
  assert.equal(report.errors.some((error) => error.code === "scan-verdict-failed"), true);
  assert.equal(report.errors.some((error) => error.code === "scan-stage-failed"), true);
});

test("reads scanner results only when they satisfy the schema contract", async () => {
  const directory = await mkdtemp(join(tmpdir(), "installermarker-scan-result-"));
  try {
    const path = join(directory, "scan-result.json");
    await writeFile(path, `${JSON.stringify(scanResult(), null, 2)}\n`);
    assert.equal((await readScanResult(path)).scanner.name, "approved-static-scanner");
    await writeFile(path, "{\"schemaVersion\":1}\n");
    await assert.rejects(() => readScanResult(path), /Scan result is invalid/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("scan-verify command emits JSON for verified artifact directories", async () => {
  const directory = await mkdtemp(join(tmpdir(), "installermarker-scan-verify-"));
  const payload = Buffer.from("installer data");
  const sha256 = createHash("sha256").update(payload).digest("hex");
  const result = scanResult();
  result.results[0].artifact.size = payload.length;
  result.results[0].artifact.sha256 = sha256;
  result.summary = { verdict: "passed", passed: 1, failed: 0, inconclusive: 0 };
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
    const resultPath = join(directory, "scan-result.json");
    await writeFile(resultPath, `${JSON.stringify(result, null, 2)}\n`);
    const output = await run(process.execPath, ["./bin/installermarker.js", "scan-verify", directory, "--result", resultPath, "--json"], { cwd: process.cwd() });
    const report = JSON.parse(output.stdout);
    assert.equal(report.valid, true);

    result.results[0].verdict = "failed";
    result.results[0].stages[0].status = "failed";
    result.summary = { verdict: "failed", passed: 0, failed: 1, inconclusive: 0 };
    await writeFile(resultPath, `${JSON.stringify(result, null, 2)}\n`);
    await assert.rejects(() => run(process.execPath, ["./bin/installermarker.js", "scan-verify", directory, "--result", resultPath, "--json"], { cwd: process.cwd() }), /Command failed/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
