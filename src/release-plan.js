import { manifestProjection } from "./projection.js";
import { createScanPlan } from "./scan.js";
import { createSigningPlan } from "./signing.js";
import { createArtifactSbom } from "./sbom.js";
import { createSmokePlan } from "./smoke.js";

function gate(name, status, summary) {
  return { name, status, summary };
}

export function createReleasePlan(verification, { generatedAt = new Date().toISOString() } = {}) {
  const options = { generatedAt };
  const sbom = createArtifactSbom(verification, options);
  const smokePlan = createSmokePlan(verification, options);
  const scanPlan = createScanPlan(verification, options);
  const signingPlan = createSigningPlan(verification, options);
  const sbomDocumentSummary = sbom.documents?.length ? ` and ${sbom.documents.length} build SBOM document(s)` : "";

  return {
    schemaVersion: 1,
    generatedAt,
    source: verification.source,
    manifest: manifestProjection(verification),
    execution: {
      mode: "plan-only",
      safety: "This plan verifies local artifact integrity and composes review gates, but does not execute artifacts, run smoke tests, invoke scanners, sign artifacts, notarize packages, or publish releases."
    },
    verification: {
      valid: true,
      manifest: verification.manifest,
      artifactCount: verification.artifacts.length
    },
    gates: [
      gate("verify-artifacts", "verified", `Verified ${verification.artifacts.length} artifact(s) against ${verification.manifest}.`),
      gate("sbom", "planned", `Generate and review ${sbom.components.length} SBOM component(s)${sbomDocumentSummary}.`),
      gate("smoke-test", "planned", `Run ${smokePlan.tests.length} smoke test plan(s) in isolated native hosts.`),
      gate("artifact-scan", "planned", `Submit ${scanPlan.requests.length} approved scanner request(s) from an isolated environment.`),
      gate("signing", "planned", `Submit ${signingPlan.requests.length} signing request(s) to a protected signing service after review gates pass.`)
    ],
    plans: {
      sbom,
      smokePlan,
      scanPlan,
      signingPlan
    }
  };
}

export function formatReleasePlan(plan, format = "text") {
  if (format === "json") return JSON.stringify(plan, null, 2);
  const lines = [
    `Release plan for ${plan.source.repository}@${plan.source.commit}`,
    `Manifest: ${plan.manifest.name}`,
    `Generated: ${plan.generatedAt}`,
    `Execution: ${plan.execution.mode}`,
    `Safety: ${plan.execution.safety}`,
    `Verification: ${plan.verification.valid ? "valid" : "invalid"} (${plan.verification.artifactCount} artifact(s))`,
    "Gates:"
  ];
  for (const item of plan.gates) lines.push(`- ${item.name}: ${item.status} - ${item.summary}`);
  return lines.join("\n");
}
