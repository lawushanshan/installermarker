import { assertVerifiedArtifactDirectory, artifactProjection, manifestProjection } from "./projection.js";

export function createArtifactSbom(verification, { generatedAt = new Date().toISOString() } = {}) {
  assertVerifiedArtifactDirectory(verification);
  const isBuildManifest = verification.manifest === "build-artifacts.json";
  const components = verification.artifacts.map((artifact, index) => {
    const sourceArtifact = verification.manifestData.artifacts[index];
    return {
      ...artifactProjection(artifact),
      provenance: isBuildManifest
        ? { sourcePath: sourceArtifact.sourcePath }
        : { sourceUrl: sourceArtifact.sourceUrl }
    };
  });

  return {
    schemaVersion: 1,
    bomFormat: "InstallerMarker",
    generatedAt,
    source: verification.source,
    manifest: manifestProjection(verification),
    ...(verification.sbomDocuments?.length ? { documents: verification.sbomDocuments } : {}),
    components
  };
}

export function formatArtifactSbom(sbom, format = "text") {
  if (format === "json") return JSON.stringify(sbom, null, 2);
  const lines = [
    `InstallerMarker SBOM for ${sbom.source.repository}@${sbom.source.commit}`,
    `Manifest: ${sbom.manifest.name}`,
    `Generated: ${sbom.generatedAt}`,
    `Components: ${sbom.components.length}`
  ];
  if (sbom.documents?.length) lines.push(`Build SBOM documents: ${sbom.documents.length}`);
  if (sbom.manifest.build) {
    lines.push(`Build: ${sbom.manifest.build.strategy} on ${sbom.manifest.build.platform}`);
  }
  if (sbom.manifest.provenance) {
    const runner = sbom.manifest.provenance.runner;
    lines.push(`Runner: Node ${runner.nodeVersion} on ${runner.platform}/${runner.arch}`);
  }
  if (sbom.source.license) lines.push(`License: ${sbom.source.license}`);
  for (const component of sbom.components) {
    const provenance = component.provenance.sourceUrl ?? component.provenance.sourcePath;
    lines.push(`- ${component.platform} ${component.name} ${component.sha256}${provenance ? ` (${provenance})` : ""}`);
  }
  for (const document of sbom.documents ?? []) lines.push(`- SBOM ${document.name} ${document.sha256} (${document.format})`);
  return lines.join("\n");
}
