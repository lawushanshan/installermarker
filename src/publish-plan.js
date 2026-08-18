import { join } from "node:path";
import { hashFile } from "./file-hash.js";
import { assertVerifiedArtifactDirectory, artifactProjection, manifestProjection } from "./projection.js";

const SHA256_PATTERN = /^[0-9a-f]{64}$/;

function sourceKey(source) {
  return `${source.repository}@${source.commit}`;
}

function gatePassed(releaseVerification, name) {
  return releaseVerification.gates?.some((gate) => gate.name === name && gate.status === "passed");
}

function assertReleaseVerificationMatches(verification, releaseVerification) {
  const requiredGates = ["verify-artifacts", "sbom", "smoke-test", "artifact-scan", "signing"];
  if (releaseVerification.valid !== true) throw new Error("Release verification must be valid before creating a publish plan.");
  if (sourceKey(releaseVerification.source) !== sourceKey(verification.source)) throw new Error("Release verification source does not match verified artifacts.");
  if (releaseVerification.manifest !== verification.manifest) throw new Error("Release verification manifest does not match verified artifacts.");
  if (releaseVerification.artifactCount !== verification.artifacts.length) throw new Error("Release verification artifact count does not match verified artifacts.");
  for (const gate of requiredGates) {
    if (!gatePassed(releaseVerification, gate)) throw new Error(`Release verification gate is not passed: ${gate}`);
  }
}

function assertReleaseTag(releaseTag) {
  if (typeof releaseTag !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(releaseTag)) {
    throw new Error("publish-plan requires a safe --release-tag using letters, numbers, dot, underscore, or hyphen.");
  }
}

function assertSha256(value, name) {
  if (typeof value !== "string" || !SHA256_PATTERN.test(value)) {
    throw new Error(`publish-plan requires a SHA-256 hash for supplemental asset: ${name}`);
  }
  return value;
}

function supplementalAssets(verification, supplementalHashes = {}) {
  return [
    { name: verification.manifest, type: "artifact-manifest", sha256: assertSha256(supplementalHashes[verification.manifest], verification.manifest) },
    { name: "release-verification.json", type: "release-verification", sha256: assertSha256(supplementalHashes["release-verification.json"], "release-verification.json") },
    ...(verification.sbomDocuments ?? []).map((document) => ({
      name: document.name,
      type: "build-sbom",
      sha256: assertSha256(document.sha256, document.name)
    }))
  ];
}

export function createPublishPlan(verification, releaseVerification, { releaseTag, generatedAt = new Date().toISOString(), supplementalHashes } = {}) {
  assertVerifiedArtifactDirectory(verification);
  assertReleaseTag(releaseTag);
  assertReleaseVerificationMatches(verification, releaseVerification);
  const assets = verification.artifacts.map((artifact) => ({
    artifact: artifactProjection(artifact),
    publishAs: artifact.name,
    requiredSha256: artifact.sha256
  }));
  return {
    schemaVersion: 1,
    generatedAt,
    source: verification.source,
    manifest: manifestProjection(verification),
    execution: {
      mode: "plan-only",
      safety: "This plan does not upload artifacts, create releases, publish packages, sign artifacts, notarize packages, or contact external services."
    },
    release: {
      tag: releaseTag,
      title: releaseTag,
      draft: true
    },
    evidence: {
      releaseVerificationValid: true,
      gateCount: releaseVerification.gates.length,
      releaseVerificationGeneratedAt: releaseVerification.generatedAt
    },
    assets,
    supplementalAssets: supplementalAssets(verification, supplementalHashes),
    checklist: [
      "Confirm redistribution rights and license evidence before publication.",
      "Upload only the listed verified artifact files and supplemental evidence files.",
      "Verify each uploaded asset hash against requiredSha256 or supplemental sha256 before making the release public.",
      "Keep signing, notarization, scanner, and release credentials outside build and smoke-test environments."
    ]
  };
}

export async function createPublishPlanFromFiles(verification, releaseVerification, { artifactDirectory, releaseVerificationFile, releaseTag, generatedAt } = {}) {
  if (!artifactDirectory) throw new Error("publish-plan requires an artifact directory to hash supplemental assets.");
  if (!releaseVerificationFile) throw new Error("publish-plan requires --release-verification to hash final release evidence.");
  const supplementalHashes = {
    [verification.manifest]: await hashFile(join(artifactDirectory, verification.manifest)),
    "release-verification.json": await hashFile(releaseVerificationFile)
  };
  return createPublishPlan(verification, releaseVerification, { releaseTag, generatedAt, supplementalHashes });
}

export function formatPublishPlan(plan, format = "text") {
  if (format === "json") return JSON.stringify(plan, null, 2);
  const lines = [
    `Publish plan for ${plan.source.repository}@${plan.source.commit}`,
    `Manifest: ${plan.manifest.name}`,
    `Release tag: ${plan.release.tag}`,
    `Execution: ${plan.execution.mode}`,
    `Safety: ${plan.execution.safety}`,
    `Assets: ${plan.assets.length}`,
    `Supplemental assets: ${plan.supplementalAssets.length}`
  ];
  for (const asset of plan.assets) lines.push(`- ${asset.artifact.platform} ${asset.publishAs} sha256:${asset.requiredSha256}`);
  for (const asset of plan.supplementalAssets) lines.push(`- supplemental ${asset.type} ${asset.name} sha256:${asset.sha256}`);
  for (const item of plan.checklist) lines.push(`check: ${item}`);
  return lines.join("\n");
}
