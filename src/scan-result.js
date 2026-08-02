import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { readFile } from "node:fs/promises";
import { actualSummary, addCheck, sameArtifactSet, sourceKey, summaryMatches } from "./result-verification.js";

const schema = JSON.parse(await readFile(new URL("../schema/scan-result.schema.json", import.meta.url), "utf8"));
const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);
const validateScanResult = ajv.compile(schema);

function allStagesPassed(results) {
  return results.every((result) => result.stages.every((stage) => stage.status === "passed"));
}

export async function readScanResult(path) {
  let result;
  try {
    result = JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    throw new Error(`Scan result must be valid JSON: ${error.message}`);
  }
  if (!validateScanResult(result)) {
    const error = validateScanResult.errors[0];
    throw new Error(`Scan result is invalid at ${error.instancePath || "/"}: ${error.message}`);
  }
  return result;
}

export function verifyScanResult(verification, scanResult, { generatedAt = new Date().toISOString() } = {}) {
  const checks = [];
  const diagnostics = [];
  const artifacts = verification.artifacts;
  const resultArtifacts = scanResult.results.map((result) => result.artifact);
  const declaredSummary = scanResult.summary;
  const computedSummary = actualSummary(scanResult.results);

  addCheck(checks, diagnostics, "source", sourceKey(scanResult.source) === sourceKey(verification.source), "Scan result source matches verified artifacts.", "scan-source-mismatch", "/source");
  addCheck(checks, diagnostics, "manifest", scanResult.manifest.name === verification.manifest, "Scan result manifest matches verified artifacts.", "scan-manifest-mismatch", "/manifest");
  addCheck(checks, diagnostics, "artifacts", sameArtifactSet(resultArtifacts, artifacts), "Scan result artifacts match verified artifact names, platforms, sizes, and hashes.", "scan-artifact-mismatch", "/results");
  addCheck(checks, diagnostics, "summary", summaryMatches(computedSummary, declaredSummary), "Scan result summary matches per-artifact verdicts.", "scan-summary-mismatch", "/summary");
  addCheck(checks, diagnostics, "verdicts", declaredSummary.verdict === "passed" && scanResult.results.every((result) => result.verdict === "passed"), "All artifact scan verdicts passed.", "scan-verdict-failed", "/results");
  addCheck(checks, diagnostics, "stages", allStagesPassed(scanResult.results), "All scanner stages passed.", "scan-stage-failed", "/results");

  const errors = diagnostics.filter((item) => item.severity === "error");
  return {
    schemaVersion: 1,
    generatedAt,
    valid: errors.length === 0,
    source: verification.source,
    manifest: verification.manifest,
    artifactCount: artifacts.length,
    scanner: scanResult.scanner,
    summary: declaredSummary,
    checks,
    errors,
    diagnostics
  };
}

export function formatScanVerification(report, format = "text") {
  if (format === "json") return JSON.stringify(report, null, 2);
  const lines = [
    `Scan result verification: ${report.valid ? "valid" : "invalid"}`,
    `Scanner: ${report.scanner.name}${report.scanner.version ? ` ${report.scanner.version}` : ""}`,
    `Artifacts: ${report.artifactCount}`,
    `Verdict: ${report.summary.verdict}`,
    `Source: ${report.source.repository}@${report.source.commit}`,
    `Manifest: ${report.manifest}`
  ];
  for (const item of report.checks) lines.push(`${item.status.toUpperCase()} ${item.name}: ${item.message}`);
  for (const error of report.errors) lines.push(`ERROR ${error.path} [${error.code}]: ${error.message}`);
  return lines.join("\n");
}
