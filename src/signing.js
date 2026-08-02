import { assertVerifiedArtifactDirectory, artifactProjection, manifestProjection } from "./projection.js";

const SIGNING_PROFILES = [
  { profile: "windows-authenticode", pattern: /\.(msi|exe)$/i, platform: "windows-x64" },
  { profile: "macos-developer-id", pattern: /\.(dmg|pkg)$/i, platform: "macos-universal" },
  { profile: "linux-detached-signature", pattern: /\.(appimage|deb|rpm)$/i, platform: "linux-x64" }
];

function signingProfile(artifact) {
  const profile = SIGNING_PROFILES.find((item) => item.pattern.test(artifact.name));
  if (!profile) throw new Error(`Unsupported artifact type for signing plan: ${artifact.name}`);
  if (profile.platform !== artifact.platform) throw new Error(`Artifact ${artifact.name} does not match its signing platform.`);
  return profile.profile;
}

function signingStages(profile) {
  if (profile === "windows-authenticode") {
    return ["submit-to-protected-signer", "authenticode-sign", "authenticode-verify"];
  }
  if (profile === "macos-developer-id") {
    return ["submit-to-protected-signer", "developer-id-sign", "notarize", "staple", "verify-notarization"];
  }
  return ["submit-to-protected-signer", "create-detached-signature", "verify-detached-signature"];
}

export function createSigningPlan(verification, { generatedAt = new Date().toISOString() } = {}) {
  assertVerifiedArtifactDirectory(verification);
  const requests = verification.artifacts.map((artifact) => {
    const profile = signingProfile(artifact);
    return {
      artifact: artifactProjection(artifact),
      profile,
      stages: signingStages(profile),
      credentialBoundary: "Submit only the verified artifact bytes and manifest metadata to a protected signing service. Do not expose signing credentials to build or smoke-test workers."
    };
  });
  return {
    schemaVersion: 1,
    generatedAt,
    source: verification.source,
    manifest: manifestProjection(verification),
    execution: {
      mode: "plan-only",
      safety: "This plan does not sign artifacts, access credentials, notarize packages, or publish releases."
    },
    requests
  };
}

export function formatSigningPlan(plan, format = "text") {
  if (format === "json") return JSON.stringify(plan, null, 2);
  const lines = [
    `Signing plan for ${plan.source.repository}@${plan.source.commit}`,
    `Manifest: ${plan.manifest.name}`,
    `Generated: ${plan.generatedAt}`,
    `Execution: ${plan.execution.mode}`,
    `Safety: ${plan.execution.safety}`,
    `Requests: ${plan.requests.length}`
  ];
  for (const request of plan.requests) {
    lines.push(`- ${request.artifact.platform} ${request.artifact.name} (${request.profile})`);
    lines.push(`  stages: ${request.stages.join(" -> ")}`);
    lines.push(`  boundary: ${request.credentialBoundary}`);
  }
  return lines.join("\n");
}
