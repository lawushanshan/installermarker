import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { readFile } from "node:fs/promises";
import { actualSummary, addCheck, sourceKey, summaryMatches } from "./result-verification.js";
import { createPublishPlanFromFiles } from "./publish-plan.js";

const schema = JSON.parse(await readFile(new URL("../schema/publish-result.schema.json", import.meta.url), "utf8"));
const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);
const validatePublishResult = ajv.compile(schema);

function assetKey(asset) {
  return `${asset.type}\0${asset.name}\0${asset.sha256}`;
}

function expectedAssets(plan) {
  return [
    ...plan.assets.map((asset) => ({
      name: asset.publishAs,
      type: "installer",
      sha256: asset.requiredSha256
    })),
    ...plan.supplementalAssets.map((asset) => ({
      name: asset.name,
      type: asset.type,
      sha256: asset.sha256
    }))
  ];
}

function sameAssetSet(left, right) {
  if (left.length !== right.length) return false;
  const leftKeys = left.map(assetKey).sort();
  const rightKeys = right.map(assetKey).sort();
  return leftKeys.every((key, index) => key === rightKeys[index]);
}

function releaseUrl(source, tag) {
  return `${source.repository}/releases/tag/${tag}`;
}

export async function readPublishResult(path) {
  let result;
  try {
    result = JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    throw new Error(`Publish result must be valid JSON: ${error.message}`);
  }
  if (!validatePublishResult(result)) {
    const error = validatePublishResult.errors[0];
    throw new Error(`Publish result is invalid at ${error.instancePath || "/"}: ${error.message}`);
  }
  return result;
}

export async function verifyPublishResult(verification, releaseVerification, publishResult, { artifactDirectory, releaseVerificationFile, releaseTag, generatedAt = new Date().toISOString() } = {}) {
  const checks = [];
  const diagnostics = [];
  const expectedPlan = await createPublishPlanFromFiles(verification, releaseVerification, {
    artifactDirectory,
    releaseVerificationFile,
    releaseTag,
    generatedAt: publishResult.generatedAt
  });
  const expected = expectedAssets(expectedPlan);
  const actual = publishResult.assets.map((asset) => ({
    name: asset.name,
    type: asset.type,
    sha256: asset.sha256
  }));
  const declaredSummary = publishResult.summary;
  const computedSummary = actualSummary(publishResult.assets);

  addCheck(checks, diagnostics, "source", sourceKey(publishResult.source) === sourceKey(verification.source), "Publish result source matches verified artifacts.", "publish-source-mismatch", "/source");
  addCheck(checks, diagnostics, "manifest", publishResult.manifest.name === verification.manifest, "Publish result manifest matches verified artifacts.", "publish-manifest-mismatch", "/manifest");
  addCheck(checks, diagnostics, "release", publishResult.release.tag === expectedPlan.release.tag && publishResult.release.draft === expectedPlan.release.draft, "Publish result release tag and draft state match the generated publish plan.", "publish-release-mismatch", "/release");
  addCheck(checks, diagnostics, "release-url", publishResult.release.url === releaseUrl(verification.source, expectedPlan.release.tag), "Publish result release URL matches the source repository and release tag.", "publish-release-url-mismatch", "/release/url");
  addCheck(checks, diagnostics, "assets", sameAssetSet(actual, expected), "Publish result assets match the generated publish plan names, types, and hashes.", "publish-asset-mismatch", "/assets");
  addCheck(checks, diagnostics, "summary", summaryMatches(computedSummary, declaredSummary), "Publish result summary matches per-asset verdicts.", "publish-summary-mismatch", "/summary");
  addCheck(checks, diagnostics, "verdicts", declaredSummary.verdict === "passed" && publishResult.assets.every((asset) => asset.verdict === "passed"), "All publish asset verdicts passed.", "publish-verdict-failed", "/assets");

  const errors = diagnostics.filter((item) => item.severity === "error");
  return {
    schemaVersion: 1,
    generatedAt,
    valid: errors.length === 0,
    source: verification.source,
    manifest: verification.manifest,
    artifactCount: verification.artifacts.length,
    assetCount: expected.length,
    publisher: publishResult.publisher,
    release: publishResult.release,
    summary: declaredSummary,
    checks,
    errors,
    diagnostics
  };
}

export function formatPublishVerification(report, format = "text") {
  if (format === "json") return JSON.stringify(report, null, 2);
  const lines = [
    `Publish result verification: ${report.valid ? "valid" : "invalid"}`,
    `Publisher: ${report.publisher.name}${report.publisher.version ? ` ${report.publisher.version}` : ""}`,
    `Release: ${report.release.tag} ${report.release.url}`,
    `Draft: ${report.release.draft}`,
    `Artifacts: ${report.artifactCount}`,
    `Assets: ${report.assetCount}`,
    `Verdict: ${report.summary.verdict}`,
    `Source: ${report.source.repository}@${report.source.commit}`,
    `Manifest: ${report.manifest}`
  ];
  for (const item of report.checks) lines.push(`${item.status.toUpperCase()} ${item.name}: ${item.message}`);
  for (const error of report.errors) lines.push(`ERROR ${error.path} [${error.code}]: ${error.message}`);
  return lines.join("\n");
}
