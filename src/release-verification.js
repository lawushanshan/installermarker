import { actualSummary, addCheck } from "./result-verification.js";
import { verifyScanResult } from "./scan-result.js";
import { verifySignResult } from "./sign-result.js";
import { createArtifactSbom } from "./sbom.js";
import { verifySmokeResult } from "./smoke-result.js";

function gate(name, passed, summary) {
  return { name, status: passed ? "passed" : "failed", summary };
}

function countSummary(results) {
  const summary = actualSummary(results);
  return `${summary.passed} passed, ${summary.failed} failed, ${summary.inconclusive} inconclusive`;
}

export function verifyReleaseEvidence(verification, { smokeResult, scanResult, signResult }, { generatedAt = new Date().toISOString() } = {}) {
  const checks = [];
  const diagnostics = [];
  const artifacts = verification.artifacts;
  const sbom = createArtifactSbom(verification, { generatedAt });
  const smokeVerification = verifySmokeResult(verification, smokeResult, { generatedAt });
  const scanVerification = verifyScanResult(verification, scanResult, { generatedAt });
  const signVerification = verifySignResult(verification, signResult, { generatedAt });
  const verificationPassed = verification.valid === true && artifacts.length > 0;
  const sbomPassed = sbom.components.length === artifacts.length;

  addCheck(checks, diagnostics, "verify-artifacts", verificationPassed, "Local artifact directory is verified.", "release-artifact-verification-failed", "verify");
  addCheck(checks, diagnostics, "sbom", sbomPassed, "SBOM projection covers every verified artifact.", "release-sbom-mismatch", "sbom");
  addCheck(checks, diagnostics, "smoke-test", smokeVerification.valid, "Isolated smoke result verification passed.", "release-smoke-verification-failed", "smokeVerification");
  addCheck(checks, diagnostics, "artifact-scan", scanVerification.valid, "Approved scanner result verification passed.", "release-scan-verification-failed", "scanVerification");
  addCheck(checks, diagnostics, "signing", signVerification.valid, "Protected signing result verification passed.", "release-sign-verification-failed", "signVerification");

  const errors = diagnostics.filter((item) => item.severity === "error");
  return {
    schemaVersion: 1,
    generatedAt,
    valid: errors.length === 0,
    source: verification.source,
    manifest: verification.manifest,
    artifactCount: artifacts.length,
    sbomDocumentCount: sbom.documents?.length ?? 0,
    gates: [
      gate("verify-artifacts", verificationPassed, `Verified ${artifacts.length} artifact(s) against ${verification.manifest}.`),
      gate("sbom", sbomPassed, `Derived ${sbom.components.length} SBOM component(s) and ${sbom.documents?.length ?? 0} build SBOM document(s).`),
      gate("smoke-test", smokeVerification.valid, `Smoke verification ${smokeVerification.valid ? "passed" : "failed"}: ${countSummary(smokeResult.results)}.`),
      gate("artifact-scan", scanVerification.valid, `Scan verification ${scanVerification.valid ? "passed" : "failed"}: ${countSummary(scanResult.results)}.`),
      gate("signing", signVerification.valid, `Signing verification ${signVerification.valid ? "passed" : "failed"}: ${countSummary(signResult.results)}.`)
    ],
    evidence: {
      verification: {
        valid: verificationPassed,
        manifest: verification.manifest,
        artifactCount: artifacts.length
      },
      sbom: {
        componentCount: sbom.components.length,
        documentCount: sbom.documents?.length ?? 0
      },
      smokeVerification,
      scanVerification,
      signVerification
    },
    checks,
    errors,
    diagnostics
  };
}

export function formatReleaseVerification(report, format = "text") {
  if (format === "json") return JSON.stringify(report, null, 2);
  const lines = [
    `Release verification: ${report.valid ? "valid" : "invalid"}`,
    `Artifacts: ${report.artifactCount}`,
    `Build SBOM documents: ${report.sbomDocumentCount}`,
    `Source: ${report.source.repository}@${report.source.commit}`,
    `Manifest: ${report.manifest}`,
    "Gates:"
  ];
  for (const item of report.gates) lines.push(`- ${item.name}: ${item.status} - ${item.summary}`);
  for (const error of report.errors) lines.push(`ERROR ${error.path} [${error.code}]: ${error.message}`);
  return lines.join("\n");
}
