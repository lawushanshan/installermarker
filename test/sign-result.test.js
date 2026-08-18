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
import { formatSignVerification, readSignResult, verifySignResult } from "../src/sign-result.js";

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

function signingStages(status = "passed") {
  return [
    { name: "submit-to-protected-signer", status, summary: "Verified artifact submitted to protected signer." },
    { name: "authenticode-sign", status, summary: "Signature applied by protected service." },
    { name: "authenticode-verify", status, summary: "Signature verified by protected service." }
  ];
}

function signResult() {
  return {
    schemaVersion: 1,
    generatedAt: "2026-01-01T00:00:00.000Z",
    signer: {
      name: "protected-release-signer",
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
      mode: "external-protected-signing-service",
      boundary: "Signer received only verified artifact bytes, hashes, manifest metadata, and the generated signing plan."
    },
    results: [{
      artifact: {
        platform: "windows-x64",
        name: "widget.msi",
        size: 13,
        sha256: "b".repeat(64)
      },
      profile: "windows-authenticode",
      verdict: "passed",
      stages: signingStages(),
      signerReference: "sign-123"
    }],
    summary: {
      verdict: "passed",
      passed: 1,
      failed: 0,
      inconclusive: 0
    }
  };
}

test("verifies a protected signer result against verified artifacts", () => {
  const report = verifySignResult(verification(), signResult(), { generatedAt: "2026-01-01T00:00:01.000Z" });
  assert.equal(report.valid, true);
  assert.equal(report.signer.name, "protected-release-signer");
  assert.equal(report.summary.verdict, "passed");
  assert.equal(report.checks.every((check) => check.status === "passed"), true);
  assert.match(formatSignVerification(report, "text"), /Signing result verification: valid/);
});

test("signing verification reports satisfy the schema contract", async () => {
  const schema = JSON.parse(await readFile(new URL("../schema/sign-verification.schema.json", import.meta.url), "utf8"));
  const ajv = new Ajv2020({ strict: true });
  addFormats(ajv);
  const validate = ajv.compile(schema);
  assert.equal(validate(verifySignResult(verification(), signResult(), { generatedAt: "2026-01-01T00:00:01.000Z" })), true);
});

test("rejects signing results that do not match verified artifact hashes", () => {
  const result = signResult();
  result.results[0].artifact.sha256 = "c".repeat(64);
  const report = verifySignResult(verification(), result, { generatedAt: "2026-01-01T00:00:01.000Z" });
  assert.equal(report.valid, false);
  assert.equal(report.errors.some((error) => error.code === "sign-artifact-mismatch"), true);
});

test("rejects signing results with failed stages", () => {
  const result = signResult();
  result.results[0].stages[1].status = "failed";
  result.results[0].verdict = "failed";
  result.summary = { verdict: "failed", passed: 0, failed: 1, inconclusive: 0 };
  const report = verifySignResult(verification(), result, { generatedAt: "2026-01-01T00:00:01.000Z" });
  assert.equal(report.valid, false);
  assert.equal(report.errors.some((error) => error.code === "sign-verdict-failed"), true);
  assert.equal(report.errors.some((error) => error.code === "sign-stage-failed"), true);
});

test("reads signing results only when they satisfy the schema contract", async () => {
  const directory = await mkdtemp(join(tmpdir(), "installermarker-sign-result-"));
  try {
    const path = join(directory, "sign-result.json");
    await writeFile(path, `${JSON.stringify(signResult(), null, 2)}\n`);
    assert.equal((await readSignResult(path)).signer.name, "protected-release-signer");
    await writeFile(path, "{\"schemaVersion\":1}\n");
    await assert.rejects(() => readSignResult(path), /Signing result is invalid/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("sign-verify command emits JSON for verified artifact directories", async () => {
  const directory = await mkdtemp(join(tmpdir(), "installermarker-sign-verify-"));
  const payload = Buffer.from("installer data");
  const sha256 = createHash("sha256").update(payload).digest("hex");
  const result = signResult();
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
    const resultPath = join(directory, "sign-result.json");
    await writeFile(resultPath, `${JSON.stringify(result, null, 2)}\n`);
    const output = await run(process.execPath, ["./bin/installermarker.js", "sign-verify", directory, "--result", resultPath, "--json"], { cwd: process.cwd() });
    const report = JSON.parse(output.stdout);
    assert.equal(report.valid, true);

    result.results[0].verdict = "failed";
    result.results[0].stages[1].status = "failed";
    result.summary = { verdict: "failed", passed: 0, failed: 1, inconclusive: 0 };
    await writeFile(resultPath, `${JSON.stringify(result, null, 2)}\n`);
    await assert.rejects(() => run(process.execPath, ["./bin/installermarker.js", "sign-verify", directory, "--result", resultPath, "--json"], { cwd: process.cwd() }), /Command failed/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
