const SUPPORTED_MANIFESTS = new Set(["artifacts.json", "build-artifacts.json"]);

export function assertVerifiedArtifactDirectory(verification) {
  if (!verification?.manifestData || !Array.isArray(verification.artifacts) || !Array.isArray(verification.manifestData.artifacts)) {
    throw new Error("A verified artifact directory is required.");
  }
  if (!SUPPORTED_MANIFESTS.has(verification.manifest)) {
    throw new Error(`Unsupported artifact manifest: ${verification.manifest}`);
  }
  if (verification.manifestData.artifacts.length !== verification.artifacts.length) {
    throw new Error("Verified artifact manifest is inconsistent.");
  }
  return verification;
}

export function manifestProjection(verification) {
  assertVerifiedArtifactDirectory(verification);
  const isBuildManifest = verification.manifest === "build-artifacts.json";
  return {
    name: verification.manifest,
    ...(isBuildManifest && verification.manifestData.build ? { build: verification.manifestData.build } : {}),
    ...(isBuildManifest && verification.manifestData.provenance ? { provenance: verification.manifestData.provenance } : {})
  };
}

export function artifactProjection(artifact) {
  return {
    platform: artifact.platform,
    name: artifact.name,
    size: artifact.size,
    sha256: artifact.sha256
  };
}
