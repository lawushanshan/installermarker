import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { readFile } from "node:fs/promises";
import { createSmokePlan } from "./smoke.js";

const schema = JSON.parse(await readFile(new URL("../schema/smoke-result.schema.json", import.meta.url), "utf8"));
const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);
const validateSmokeResult = ajv.compile(schema);

function diagnostic(severity, code, path, message) {
  return { severity, code, path, message };
}

function check(name, passed, message) {
  return { name, status: passed ? "passed" : "failed", message };
}

function addCheck(checks, diagnostics, name, passed, message, code, path) {
  checks.push(check(name, passed, message));
  if (!passed) diagnostics.push(diagnostic("error", code, path, message));
}

function sourceKey(source) {
  return `${source.repository}@${source.commit}`;
}

function artifactKey(artifact) {
  return `${artifact.platform}\0${artifact.name}\0${artifact.size}\0${artifact.sha256}`;
}

function sameArtifactSet(left, right) {
  if (left.length !== right.length) return false;
  const leftKeys = left.map(artifactKey).sort();
  const rightKeys = right.map(artifactKey).sort();
  return leftKeys.every((key, index) => key === rightKeys[index]);
}

function expectedKey(test) {
  return `${artifactKey(test.artifact)}\0${test.installerType}\0${test.runOn}\0${test.steps.map((step) => step.name).join("\0")}`;
}

function resultKey(result) {
  return `${artifactKey(result.artifact)}\0${result.installerType}\0${result.runOn}\0${result.steps.map((step) => step.name).join("\0")}`;
}

function sameSmokeSet(results, expectedTests) {
  if (results.length !== expectedTests.length) return false;
  const resultKeys = results.map(resultKey).sort();
  const expectedKeys = expectedTests.map(expectedKey).sort();
  return resultKeys.every((key, index) => key === expectedKeys[index]);
}

function actualSummary(results) {
  const summary = { passed: 0, failed: 0, inconclusive: 0 };
  for (const result of results) summary[result.verdict] += 1;
  return {
    verdict: summary.failed > 0 ? "failed" : summary.inconclusive > 0 ? "inconclusive" : "passed",
    ...summary
  };
}

function summaryMatches(actual, declared) {
  return actual.verdict === declared.verdict
    && actual.passed === declared.passed
    && actual.failed === declared.failed
    && actual.inconclusive === declared.inconclusive;
}

function allStepsPassed(results) {
  return results.every((result) => result.steps.every((step) => step.status === "passed"));
}

export async function readSmokeResult(path) {
  let result;
  try {
    result = JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    throw new Error(`Smoke result must be valid JSON: ${error.message}`);
  }
  if (!validateSmokeResult(result)) {
    const error = validateSmokeResult.errors[0];
    throw new Error(`Smoke result is invalid at ${error.instancePath || "/"}: ${error.message}`);
  }
  return result;
}

export function verifySmokeResult(verification, smokeResult, { generatedAt = new Date().toISOString() } = {}) {
  const checks = [];
  const diagnostics = [];
  const artifacts = verification.artifacts;
  const expectedPlan = createSmokePlan(verification, { generatedAt: smokeResult.generatedAt });
  const resultArtifacts = smokeResult.results.map((result) => result.artifact);
  const declaredSummary = smokeResult.summary;
  const computedSummary = actualSummary(smokeResult.results);

  addCheck(checks, diagnostics, "source", sourceKey(smokeResult.source) === sourceKey(verification.source), "Smoke result source matches verified artifacts.", "smoke-source-mismatch", "/source");
  addCheck(checks, diagnostics, "manifest", smokeResult.manifest.name === verification.manifest, "Smoke result manifest matches verified artifacts.", "smoke-manifest-mismatch", "/manifest");
  addCheck(checks, diagnostics, "artifacts", sameArtifactSet(resultArtifacts, artifacts), "Smoke result artifacts match verified artifact names, platforms, sizes, and hashes.", "smoke-artifact-mismatch", "/results");
  addCheck(checks, diagnostics, "plan", sameSmokeSet(smokeResult.results, expectedPlan.tests), "Smoke result installer types, hosts, and step names match the generated smoke plan.", "smoke-plan-mismatch", "/results");
  addCheck(checks, diagnostics, "summary", summaryMatches(computedSummary, declaredSummary), "Smoke result summary matches per-artifact verdicts.", "smoke-summary-mismatch", "/summary");
  addCheck(checks, diagnostics, "verdicts", declaredSummary.verdict === "passed" && smokeResult.results.every((result) => result.verdict === "passed"), "All artifact smoke verdicts passed.", "smoke-verdict-failed", "/results");
  addCheck(checks, diagnostics, "steps", allStepsPassed(smokeResult.results), "All smoke test steps passed.", "smoke-step-failed", "/results");

  const errors = diagnostics.filter((item) => item.severity === "error");
  return {
    schemaVersion: 1,
    generatedAt,
    valid: errors.length === 0,
    source: verification.source,
    manifest: verification.manifest,
    artifactCount: artifacts.length,
    runner: smokeResult.runner,
    summary: declaredSummary,
    checks,
    errors,
    diagnostics
  };
}

export function formatSmokeVerification(report, format = "text") {
  if (format === "json") return JSON.stringify(report, null, 2);
  const lines = [
    `Smoke result verification: ${report.valid ? "valid" : "invalid"}`,
    `Runner: ${report.runner.name}${report.runner.version ? ` ${report.runner.version}` : ""} on ${report.runner.platform}`,
    `Artifacts: ${report.artifactCount}`,
    `Verdict: ${report.summary.verdict}`,
    `Source: ${report.source.repository}@${report.source.commit}`,
    `Manifest: ${report.manifest}`
  ];
  for (const item of report.checks) lines.push(`${item.status.toUpperCase()} ${item.name}: ${item.message}`);
  for (const error of report.errors) lines.push(`ERROR ${error.path} [${error.code}]: ${error.message}`);
  return lines.join("\n");
}
