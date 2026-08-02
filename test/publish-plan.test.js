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
import { createPublishPlan, createPublishPlanFromFiles, formatPublishPlan } from "../src/publish-plan.js";
import { readReleaseVerification } from "../src/release-verification.js";

const run = promisify(execFile);

function source() {
  return {
    repository: "https://github.com/acme/widget",
    commit: "a".repeat(40),
    license: "MIT"
  };
}

function artifact(size = 13, sha256 = "b".repeat(64)) {
  return {
    platform: "windows-x64",
    name: "widget.msi",
    size,
    sha256
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

function releaseVerification() {
  return {
    schemaVersion: 1,
    generatedAt: "2026-01-01T00:00:00.000Z",
    valid: true,
    source: source(),
    manifest: "artifacts.json",
    artifactCount: 1,
    sbomDocumentCount: 0,
    gates: [
      { name: "verify-artifacts", status: "passed", summary: "Artifacts verified." },
      { name: "sbom", status: "passed", summary: "SBOM reviewed." },
      { name: "smoke-test", status: "passed", summary: "Smoke passed." },
      { name: "artifact-scan", status: "passed", summary: "Scan passed." },
      { name: "signing", status: "passed", summary: "Signing passed." }
    ],
    evidence: {
      verification: { valid: true, manifest: "artifacts.json", artifactCount: 1 },
      sbom: { componentCount: 1, documentCount: 0 },
      smokeVerification: { valid: true },
      scanVerification: { valid: true },
      signVerification: { valid: true }
    },
    checks: [],
    errors: [],
    diagnostics: []
  };
}

function supplementalHashes() {
  return {
    "artifacts.json": "c".repeat(64),
    "release-verification.json": "d".repeat(64)
  };
}

test("creates a plan-only publish plan from verified release evidence", () => {
  const plan = createPublishPlan(verification(), releaseVerification(), { releaseTag: "v1.0.0", generatedAt: "2026-01-01T00:00:01.000Z", supplementalHashes: supplementalHashes() });
  assert.equal(plan.execution.mode, "plan-only");
  assert.equal(plan.release.tag, "v1.0.0");
  assert.equal(plan.release.draft, true);
  assert.equal(plan.assets[0].publishAs, "widget.msi");
  assert.equal(plan.supplementalAssets.find((asset) => asset.name === "artifacts.json").sha256, "c".repeat(64));
  assert.equal(plan.supplementalAssets.find((asset) => asset.name === "release-verification.json").sha256, "d".repeat(64));
  assert.match(formatPublishPlan(plan, "text"), /release-verification\.json sha256:d{64}/);
});

test("publish plans satisfy the schema contract", async () => {
  const schema = JSON.parse(await readFile(new URL("../schema/publish-plan.schema.json", import.meta.url), "utf8"));
  const ajv = new Ajv2020({ strict: true });
  addFormats(ajv);
  const validate = ajv.compile(schema);
  const plan = createPublishPlan(verification(), releaseVerification(), { releaseTag: "v1.0.0", generatedAt: "2026-01-01T00:00:01.000Z", supplementalHashes: supplementalHashes() });
  assert.equal(validate(plan), true);
});

test("rejects publish plans when release evidence is incomplete", () => {
  const report = releaseVerification();
  report.gates[3].status = "failed";
  assert.throws(() => createPublishPlan(verification(), report, { releaseTag: "v1.0.0", supplementalHashes: supplementalHashes() }), /artifact-scan/);
});

test("rejects publish plans without supplemental asset hashes", () => {
  assert.throws(() => createPublishPlan(verification(), releaseVerification(), { releaseTag: "v1.0.0", supplementalHashes: { "artifacts.json": "c".repeat(64) } }), /release-verification\.json/);
});

test("reads release verification only when it satisfies the schema contract", async () => {
  const directory = await mkdtemp(join(tmpdir(), "installermarker-release-verification-"));
  try {
    const path = join(directory, "release-verification.json");
    await writeFile(path, `${JSON.stringify(releaseVerification(), null, 2)}\n`);
    assert.equal((await readReleaseVerification(path)).valid, true);
    await writeFile(path, "{\"schemaVersion\":1}\n");
    await assert.rejects(() => readReleaseVerification(path), /Release verification is invalid/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("publish-plan command emits JSON for verified artifact directories", async () => {
  const directory = await mkdtemp(join(tmpdir(), "installermarker-publish-plan-"));
  const payload = Buffer.from("installer data");
  const sha256 = createHash("sha256").update(payload).digest("hex");
  const report = releaseVerification();
  try {
    await writeFile(join(directory, "widget.msi"), payload);
    const manifestContent = `${JSON.stringify({
      schemaVersion: 1,
      source: source(),
      artifacts: [{
        ...artifact(payload.length, sha256),
        sourceUrl: "https://github.com/acme/widget/releases/download/v1/widget.msi"
      }],
      skipped: []
    }, null, 2)}\n`;
    await writeFile(join(directory, "artifacts.json"), manifestContent);
    const reportPath = join(directory, "release-verification.json");
    const reportContent = `${JSON.stringify(report, null, 2)}\n`;
    await writeFile(reportPath, reportContent);
    const output = await run(process.execPath, ["./bin/installermarker.js", "publish-plan", directory, "--release-verification", reportPath, "--release-tag", "v1.0.0", "--json"], { cwd: process.cwd() });
    const plan = JSON.parse(output.stdout);
    assert.equal(plan.release.tag, "v1.0.0");
    assert.equal(plan.assets[0].requiredSha256, sha256);
    assert.equal(plan.supplementalAssets.find((asset) => asset.name === "artifacts.json").sha256, createHash("sha256").update(manifestContent).digest("hex"));
    assert.equal(plan.supplementalAssets.find((asset) => asset.name === "release-verification.json").sha256, createHash("sha256").update(reportContent).digest("hex"));

    report.source.commit = "c".repeat(40);
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
    await assert.rejects(() => run(process.execPath, ["./bin/installermarker.js", "publish-plan", directory, "--release-verification", reportPath, "--release-tag", "v1.0.0", "--json"], { cwd: process.cwd() }), /Command failed/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("createPublishPlanFromFiles hashes supplemental assets from disk", async () => {
  const directory = await mkdtemp(join(tmpdir(), "installermarker-publish-plan-files-"));
  const report = releaseVerification();
  const manifestContent = `${JSON.stringify({ schemaVersion: 1, source: source(), artifacts: [], skipped: [] }, null, 2)}\n`;
  const reportContent = `${JSON.stringify(report, null, 2)}\n`;
  try {
    await writeFile(join(directory, "artifacts.json"), manifestContent);
    const reportPath = join(directory, "release-verification.json");
    await writeFile(reportPath, reportContent);
    const plan = await createPublishPlanFromFiles(verification(), report, {
      artifactDirectory: directory,
      releaseVerificationFile: reportPath,
      releaseTag: "v1.0.0",
      generatedAt: "2026-01-01T00:00:01.000Z"
    });
    assert.equal(plan.supplementalAssets.find((asset) => asset.name === "artifacts.json").sha256, createHash("sha256").update(manifestContent).digest("hex"));
    assert.equal(plan.supplementalAssets.find((asset) => asset.name === "release-verification.json").sha256, createHash("sha256").update(reportContent).digest("hex"));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
