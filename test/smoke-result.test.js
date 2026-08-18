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
import { formatSmokeVerification, readSmokeResult, verifySmokeResult } from "../src/smoke-result.js";

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

function smokeSteps(status = "passed") {
  return [
    { name: "prepare-isolated-host", status, summary: "Disposable host prepared." },
    { name: "install", status, summary: "Installer completed." },
    { name: "launch", status, summary: "Entrypoint launched." },
    { name: "uninstall", status, summary: "Removal completed." }
  ];
}

function smokeResult() {
  return {
    schemaVersion: 1,
    generatedAt: "2026-01-01T00:00:00.000Z",
    runner: {
      name: "isolated-smoke-runner",
      version: "1.0.0",
      platform: "windows-x64"
    },
    source: {
      repository: "https://github.com/acme/widget",
      commit: "a".repeat(40),
      license: "MIT"
    },
    manifest: { name: "artifacts.json" },
    execution: {
      mode: "external-isolated-smoke-runner",
      boundary: "Runner received only verified artifact bytes, hashes, manifest metadata, and the generated smoke plan."
    },
    results: [{
      artifact: {
        platform: "windows-x64",
        name: "widget.msi",
        size: 13,
        sha256: "b".repeat(64)
      },
      installerType: "msi",
      runOn: "windows-x64",
      verdict: "passed",
      steps: smokeSteps(),
      runnerReference: "smoke-123"
    }],
    summary: {
      verdict: "passed",
      passed: 1,
      failed: 0,
      inconclusive: 0
    }
  };
}

test("verifies an isolated smoke result against verified artifacts", () => {
  const report = verifySmokeResult(verification(), smokeResult(), { generatedAt: "2026-01-01T00:00:01.000Z" });
  assert.equal(report.valid, true);
  assert.equal(report.runner.name, "isolated-smoke-runner");
  assert.equal(report.summary.verdict, "passed");
  assert.equal(report.checks.every((check) => check.status === "passed"), true);
  assert.match(formatSmokeVerification(report, "text"), /Smoke result verification: valid/);
});

test("smoke verification reports satisfy the schema contract", async () => {
  const schema = JSON.parse(await readFile(new URL("../schema/smoke-verification.schema.json", import.meta.url), "utf8"));
  const ajv = new Ajv2020({ strict: true });
  addFormats(ajv);
  const validate = ajv.compile(schema);
  assert.equal(validate(verifySmokeResult(verification(), smokeResult(), { generatedAt: "2026-01-01T00:00:01.000Z" })), true);
});

test("rejects smoke results that do not match verified artifact hashes", () => {
  const result = smokeResult();
  result.results[0].artifact.sha256 = "c".repeat(64);
  const report = verifySmokeResult(verification(), result, { generatedAt: "2026-01-01T00:00:01.000Z" });
  assert.equal(report.valid, false);
  assert.equal(report.errors.some((error) => error.code === "smoke-artifact-mismatch"), true);
});

test("rejects smoke results with failed steps", () => {
  const result = smokeResult();
  result.results[0].steps[1].status = "failed";
  result.results[0].verdict = "failed";
  result.summary = { verdict: "failed", passed: 0, failed: 1, inconclusive: 0 };
  const report = verifySmokeResult(verification(), result, { generatedAt: "2026-01-01T00:00:01.000Z" });
  assert.equal(report.valid, false);
  assert.equal(report.errors.some((error) => error.code === "smoke-verdict-failed"), true);
  assert.equal(report.errors.some((error) => error.code === "smoke-step-failed"), true);
});

test("reads smoke results only when they satisfy the schema contract", async () => {
  const directory = await mkdtemp(join(tmpdir(), "installermarker-smoke-result-"));
  try {
    const path = join(directory, "smoke-result.json");
    await writeFile(path, `${JSON.stringify(smokeResult(), null, 2)}\n`);
    assert.equal((await readSmokeResult(path)).runner.name, "isolated-smoke-runner");
    await writeFile(path, "{\"schemaVersion\":1}\n");
    await assert.rejects(() => readSmokeResult(path), /Smoke result is invalid/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("smoke-verify command emits JSON for verified artifact directories", async () => {
  const directory = await mkdtemp(join(tmpdir(), "installermarker-smoke-verify-"));
  const payload = Buffer.from("installer data");
  const sha256 = createHash("sha256").update(payload).digest("hex");
  const result = smokeResult();
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
    const resultPath = join(directory, "smoke-result.json");
    await writeFile(resultPath, `${JSON.stringify(result, null, 2)}\n`);
    const output = await run(process.execPath, ["./bin/installermarker.js", "smoke-verify", directory, "--result", resultPath, "--json"], { cwd: process.cwd() });
    const report = JSON.parse(output.stdout);
    assert.equal(report.valid, true);

    result.results[0].verdict = "failed";
    result.results[0].steps[1].status = "failed";
    result.summary = { verdict: "failed", passed: 0, failed: 1, inconclusive: 0 };
    await writeFile(resultPath, `${JSON.stringify(result, null, 2)}\n`);
    await assert.rejects(() => run(process.execPath, ["./bin/installermarker.js", "smoke-verify", directory, "--result", resultPath, "--json"], { cwd: process.cwd() }), /Command failed/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
