import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { readFile } from "node:fs/promises";
import { actualSummary, addCheck, artifactKey, sameArtifactSet, sourceKey, summaryMatches } from "./result-verification.js";
import { createSigningPlan } from "./signing.js";

const schema = JSON.parse(await readFile(new URL("../schema/sign-result.schema.json", import.meta.url), "utf8"));
const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);
const validateSignResult = ajv.compile(schema);

function expectedKey(request) {
  return `${artifactKey(request.artifact)}\0${request.profile}\0${request.stages.join("\0")}`;
}

function resultKey(result) {
  return `${artifactKey(result.artifact)}\0${result.profile}\0${result.stages.map((stage) => stage.name).join("\0")}`;
}

function sameSigningSet(results, expectedRequests) {
  if (results.length !== expectedRequests.length) return false;
  const resultKeys = results.map(resultKey).sort();
  const expectedKeys = expectedRequests.map(expectedKey).sort();
  return resultKeys.every((key, index) => key === expectedKeys[index]);
}

function allStagesPassed(results) {
  return results.every((result) => result.stages.every((stage) => stage.status === "passed"));
}

export async function readSignResult(path) {
  let result;
  try {
    result = JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    throw new Error(`Signing result must be valid JSON: ${error.message}`);
  }
  if (!validateSignResult(result)) {
    const error = validateSignResult.errors[0];
    throw new Error(`Signing result is invalid at ${error.instancePath || "/"}: ${error.message}`);
  }
  return result;
}

export function verifySignResult(verification, signResult, { generatedAt = new Date().toISOString() } = {}) {
  const checks = [];
  const diagnostics = [];
  const artifacts = verification.artifacts;
  const expectedPlan = createSigningPlan(verification, { generatedAt: signResult.generatedAt });
  const resultArtifacts = signResult.results.map((result) => result.artifact);
  const declaredSummary = signResult.summary;
  const computedSummary = actualSummary(signResult.results);

  addCheck(checks, diagnostics, "source", sourceKey(signResult.source) === sourceKey(verification.source), "Signing result source matches verified artifacts.", "sign-source-mismatch", "/source");
  addCheck(checks, diagnostics, "manifest", signResult.manifest.name === verification.manifest, "Signing result manifest matches verified artifacts.", "sign-manifest-mismatch", "/manifest");
  addCheck(checks, diagnostics, "artifacts", sameArtifactSet(resultArtifacts, artifacts), "Signing result artifacts match verified artifact names, platforms, sizes, and hashes.", "sign-artifact-mismatch", "/results");
  addCheck(checks, diagnostics, "plan", sameSigningSet(signResult.results, expectedPlan.requests), "Signing result profiles and stage names match the generated signing plan.", "sign-plan-mismatch", "/results");
  addCheck(checks, diagnostics, "summary", summaryMatches(computedSummary, declaredSummary), "Signing result summary matches per-artifact verdicts.", "sign-summary-mismatch", "/summary");
  addCheck(checks, diagnostics, "verdicts", declaredSummary.verdict === "passed" && signResult.results.every((result) => result.verdict === "passed"), "All artifact signing verdicts passed.", "sign-verdict-failed", "/results");
  addCheck(checks, diagnostics, "stages", allStagesPassed(signResult.results), "All signing stages passed.", "sign-stage-failed", "/results");

  const errors = diagnostics.filter((item) => item.severity === "error");
  return {
    schemaVersion: 1,
    generatedAt,
    valid: errors.length === 0,
    source: verification.source,
    manifest: verification.manifest,
    artifactCount: artifacts.length,
    signer: signResult.signer,
    summary: declaredSummary,
    checks,
    errors,
    diagnostics
  };
}

export function formatSignVerification(report, format = "text") {
  if (format === "json") return JSON.stringify(report, null, 2);
  const lines = [
    `Signing result verification: ${report.valid ? "valid" : "invalid"}`,
    `Signer: ${report.signer.name}${report.signer.version ? ` ${report.signer.version}` : ""}`,
    `Artifacts: ${report.artifactCount}`,
    `Verdict: ${report.summary.verdict}`,
    `Source: ${report.source.repository}@${report.source.commit}`,
    `Manifest: ${report.manifest}`
  ];
  for (const item of report.checks) lines.push(`${item.status.toUpperCase()} ${item.name}: ${item.message}`);
  for (const error of report.errors) lines.push(`ERROR ${error.path} [${error.code}]: ${error.message}`);
  return lines.join("\n");
}
