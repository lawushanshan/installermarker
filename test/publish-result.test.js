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
import { readPublishResult, verifyPublishResult } from "../src/publish-result.js";
import { readReleaseVerification } from "../src/release-verification.js";
import { verifyArtifactDirectory } from "../src/verify.js";

const run = promisify(execFile);

function source() {
  return {
    repository: "https://github.com/acme/widget",
    commit: "a".repeat(40),
    license: "MIT"
  };
}

function artifact(size, sha256) {
  return {
    platform: "windows-x64",
    name: "widget.msi",
    size,
    sha256
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

function summary(assetCount) {
  return { verdict: "passed", passed: assetCount, failed: 0, inconclusive: 0 };
}

function publishResult({ artifactSha, manifestSha, releaseVerificationSha, tag = "v1.0.0" }) {
  const assets = [
    {
      name: "widget.msi",
      type: "installer",
      sha256: artifactSha,
      verdict: "passed",
      url: `https://github.com/acme/widget/releases/download/${tag}/widget.msi`
    },
    { name: "artifacts.json", type: "artifact-manifest", sha256: manifestSha, verdict: "passed" },
    { name: "release-verification.json", type: "release-verification", sha256: releaseVerificationSha, verdict: "passed" }
  ];
  return {
    schemaVersion: 1,
    generatedAt: "2026-01-01T00:00:02.000Z",
    publisher: { name: "protected-release-service", version: "1.0.0", policy: "draft-only" },
    source: source(),
    manifest: { name: "artifacts.json" },
    release: {
      tag,
      url: `https://github.com/acme/widget/releases/tag/${tag}`,
      draft: true
    },
    execution: {
      mode: "external-protected-release-service",
      boundary: "The release service uploaded only assets listed in publish-plan.json."
    },
    assets,
    summary: summary(assets.length)
  };
}

async function createFixture() {
  const directory = await mkdtemp(join(tmpdir(), "installermarker-publish-result-"));
  const payload = Buffer.from("installer data");
  const artifactSha = createHash("sha256").update(payload).digest("hex");
  const manifestContent = `${JSON.stringify({
    schemaVersion: 1,
    source: source(),
    artifacts: [{
      ...artifact(payload.length, artifactSha),
      sourceUrl: "https://github.com/acme/widget/releases/download/v1/widget.msi"
    }],
    skipped: []
  }, null, 2)}\n`;
  const reportContent = `${JSON.stringify(releaseVerification(), null, 2)}\n`;
  await writeFile(join(directory, "widget.msi"), payload);
  await writeFile(join(directory, "artifacts.json"), manifestContent);
  const reportPath = join(directory, "release-verification.json");
  await writeFile(reportPath, reportContent);
  return {
    directory,
    reportPath,
    artifactSha,
    manifestSha: createHash("sha256").update(manifestContent).digest("hex"),
    releaseVerificationSha: createHash("sha256").update(reportContent).digest("hex")
  };
}

test("verifies a protected publish result against the generated publish plan", async () => {
  const fixture = await createFixture();
  try {
    const verification = await verifyArtifactDirectory(fixture.directory);
    const releaseReport = await readReleaseVerification(fixture.reportPath);
    const report = await verifyPublishResult(verification, releaseReport, publishResult(fixture), {
      artifactDirectory: fixture.directory,
      releaseVerificationFile: fixture.reportPath,
      releaseTag: "v1.0.0",
      generatedAt: "2026-01-01T00:00:03.000Z"
    });
    assert.equal(report.valid, true);
    assert.equal(report.release.tag, "v1.0.0");
    assert.equal(report.assetCount, 3);
    assert.equal(report.summary.verdict, "passed");
  } finally {
    await rm(fixture.directory, { recursive: true, force: true });
  }
});

test("publish verification reports satisfy the schema contract", async () => {
  const fixture = await createFixture();
  try {
    const schema = JSON.parse(await readFile(new URL("../schema/publish-verification.schema.json", import.meta.url), "utf8"));
    const ajv = new Ajv2020({ strict: true });
    addFormats(ajv);
    const validate = ajv.compile(schema);
    const report = await verifyPublishResult(await verifyArtifactDirectory(fixture.directory), await readReleaseVerification(fixture.reportPath), publishResult(fixture), {
      artifactDirectory: fixture.directory,
      releaseVerificationFile: fixture.reportPath,
      releaseTag: "v1.0.0",
      generatedAt: "2026-01-01T00:00:03.000Z"
    });
    assert.equal(validate(report), true);
  } finally {
    await rm(fixture.directory, { recursive: true, force: true });
  }
});

test("rejects publish results whose assets do not match the publish plan", async () => {
  const fixture = await createFixture();
  try {
    const result = publishResult({ ...fixture, releaseVerificationSha: "e".repeat(64) });
    const report = await verifyPublishResult(await verifyArtifactDirectory(fixture.directory), await readReleaseVerification(fixture.reportPath), result, {
      artifactDirectory: fixture.directory,
      releaseVerificationFile: fixture.reportPath,
      releaseTag: "v1.0.0"
    });
    assert.equal(report.valid, false);
    assert.equal(report.errors.some((error) => error.code === "publish-asset-mismatch"), true);
  } finally {
    await rm(fixture.directory, { recursive: true, force: true });
  }
});

test("reads publish results only when they satisfy the schema contract", async () => {
  const directory = await mkdtemp(join(tmpdir(), "installermarker-publish-result-schema-"));
  try {
    const path = join(directory, "publish-result.json");
    const fixture = { artifactSha: "b".repeat(64), manifestSha: "c".repeat(64), releaseVerificationSha: "d".repeat(64) };
    await writeFile(path, `${JSON.stringify(publishResult(fixture), null, 2)}\n`);
    assert.equal((await readPublishResult(path)).publisher.name, "protected-release-service");
    await writeFile(path, "{\"schemaVersion\":1}\n");
    await assert.rejects(() => readPublishResult(path), /Publish result is invalid/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("publish-verify command emits JSON and rejects mismatched release tags", async () => {
  const fixture = await createFixture();
  try {
    const resultPath = join(fixture.directory, "publish-result.json");
    await writeFile(resultPath, `${JSON.stringify(publishResult(fixture), null, 2)}\n`);
    const output = await run(process.execPath, ["./bin/installermarker.js", "publish-verify", fixture.directory, "--release-verification", fixture.reportPath, "--release-tag", "v1.0.0", "--result", resultPath, "--json"], { cwd: process.cwd() });
    const report = JSON.parse(output.stdout);
    assert.equal(report.valid, true);
    assert.equal(report.assetCount, 3);

    await writeFile(resultPath, `${JSON.stringify(publishResult({ ...fixture, tag: "v2.0.0" }), null, 2)}\n`);
    await assert.rejects(() => run(process.execPath, ["./bin/installermarker.js", "publish-verify", fixture.directory, "--release-verification", fixture.reportPath, "--release-tag", "v1.0.0", "--result", resultPath, "--json"], { cwd: process.cwd() }), /Command failed/);
  } finally {
    await rm(fixture.directory, { recursive: true, force: true });
  }
});
