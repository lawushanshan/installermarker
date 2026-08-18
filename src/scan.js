import { assertVerifiedArtifactDirectory, artifactProjection, manifestProjection } from "./projection.js";

const ARTIFACT_TYPES = [
  { type: "windows-installer", pattern: /\.(msi|exe)$/i, platform: "windows-x64" },
  { type: "macos-installer", pattern: /\.(dmg|pkg)$/i, platform: "macos-universal" },
  { type: "linux-installer", pattern: /\.(appimage|deb|rpm)$/i, platform: "linux-x64" }
];

function artifactType(artifact) {
  const type = ARTIFACT_TYPES.find((item) => item.pattern.test(artifact.name));
  if (!type) throw new Error(`Unsupported artifact type for scan plan: ${artifact.name}`);
  if (type.platform !== artifact.platform) throw new Error(`Artifact ${artifact.name} does not match its scan platform.`);
  return type.type;
}

function scanStages(type) {
  const stages = [
    "hash-reputation-lookup",
    "static-malware-scan",
    "signature-policy-check",
    "sbom-correlation"
  ];
  if (type === "windows-installer") return [...stages, "authenticode-reputation-review"];
  if (type === "macos-installer") return [...stages, "notarization-status-review"];
  return [...stages, "package-metadata-review"];
}

export function createScanPlan(verification, { generatedAt = new Date().toISOString() } = {}) {
  assertVerifiedArtifactDirectory(verification);
  const requests = verification.artifacts.map((artifact) => {
    const type = artifactType(artifact);
    return {
      artifact: artifactProjection(artifact),
      artifactType: type,
      stages: scanStages(type),
      submissionBoundary: "Submit only verified artifact bytes, hashes, and manifest metadata to an approved scanner from an isolated environment. This plan does not upload artifacts or invoke scanners."
    };
  });
  return {
    schemaVersion: 1,
    generatedAt,
    source: verification.source,
    manifest: manifestProjection(verification),
    execution: {
      mode: "plan-only",
      safety: "This plan does not execute artifacts, run scanners, upload samples, or contact reputation services."
    },
    requests
  };
}

export function formatScanPlan(plan, format = "text") {
  if (format === "json") return JSON.stringify(plan, null, 2);
  const lines = [
    `Artifact scan plan for ${plan.source.repository}@${plan.source.commit}`,
    `Manifest: ${plan.manifest.name}`,
    `Generated: ${plan.generatedAt}`,
    `Execution: ${plan.execution.mode}`,
    `Safety: ${plan.execution.safety}`,
    `Requests: ${plan.requests.length}`
  ];
  for (const request of plan.requests) {
    lines.push(`- ${request.artifact.platform} ${request.artifact.name} (${request.artifactType})`);
    lines.push(`  stages: ${request.stages.join(" -> ")}`);
    lines.push(`  boundary: ${request.submissionBoundary}`);
  }
  return lines.join("\n");
}
