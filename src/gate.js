import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const REQUIRED_FILES = {
  verification: "verify.json",
  sbom: "sbom.json",
  smokePlan: "smoke-plan.json",
  scanPlan: "scan-plan.json",
  signingPlan: "sign-plan.json",
  releasePlan: "release-plan.json"
};

function diagnostic(severity, code, path, message) {
  return { severity, code, path, message };
}

function check(name, passed, message) {
  return { name, status: passed ? "passed" : "failed", message };
}

async function readJsonFile(root, name, diagnostics) {
  const path = join(root, name);
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    diagnostics.push(diagnostic("error", error.code === "ENOENT" ? "gate-file-missing" : "gate-file-invalid", name, `Cannot read ${name}: ${error.message}`));
    return null;
  }
}

function sourceKey(source) {
  return source?.repository && source?.commit ? `${source.repository}@${source.commit}` : null;
}

function artifactKey(artifact) {
  return artifact?.platform && artifact?.name && Number.isInteger(artifact.size) && artifact?.sha256
    ? `${artifact.platform}\0${artifact.name}\0${artifact.size}\0${artifact.sha256}`
    : null;
}

function documentKey(document) {
  return document?.name && document?.format && Number.isInteger(document.size) && document?.sha256 && document?.sourcePath
    ? `${document.name}\0${document.format}\0${document.size}\0${document.sha256}\0${document.sourcePath}`
    : null;
}

function sameKeySet(actual, expected) {
  if (actual.length !== expected.length) return false;
  const actualKeys = actual.map(artifactKey).sort();
  const expectedKeys = expected.map(artifactKey).sort();
  return actualKeys.every((key, index) => key && key === expectedKeys[index]);
}

function sameDocumentSet(actual, expected) {
  if (actual.length !== expected.length) return false;
  const actualKeys = actual.map(documentKey).sort();
  const expectedKeys = expected.map(documentKey).sort();
  return actualKeys.every((key, index) => key && key === expectedKeys[index]);
}

function addCheck(checks, diagnostics, name, passed, message, code, path) {
  checks.push(check(name, passed, message));
  if (!passed) diagnostics.push(diagnostic("error", code, path, message));
}

function artifactsFromSbom(sbom) {
  return Array.isArray(sbom?.components) ? sbom.components.map((component) => ({
    platform: component.platform,
    name: component.name,
    size: component.size,
    sha256: component.sha256
  })) : [];
}

function artifactsFromEntries(value, key) {
  return Array.isArray(value?.[key]) ? value[key].map((entry) => entry.artifact) : [];
}

function checkPlanConsistency({ checks, diagnostics, name, file, source, manifestName, artifacts }) {
  addCheck(checks, diagnostics, `${name}-source`, sourceKey(file?.source) === sourceKey(source), `${REQUIRED_FILES[name]} source matches verify.json.`, "gate-source-mismatch", REQUIRED_FILES[name]);
  addCheck(checks, diagnostics, `${name}-manifest`, file?.manifest?.name === manifestName, `${REQUIRED_FILES[name]} manifest matches verify.json.`, "gate-manifest-mismatch", REQUIRED_FILES[name]);

  if (name === "sbom") {
    addCheck(checks, diagnostics, "sbom-components", sameKeySet(artifactsFromSbom(file), artifacts), "sbom.json components match verified artifacts.", "gate-artifact-mismatch", REQUIRED_FILES[name]);
    return;
  }
  if (name === "smokePlan") {
    addCheck(checks, diagnostics, "smoke-tests", sameKeySet(artifactsFromEntries(file, "tests"), artifacts), "smoke-plan.json tests match verified artifacts.", "gate-artifact-mismatch", REQUIRED_FILES[name]);
    return;
  }
  if (name === "scanPlan") {
    addCheck(checks, diagnostics, "scan-requests", sameKeySet(artifactsFromEntries(file, "requests"), artifacts), "scan-plan.json requests match verified artifacts.", "gate-artifact-mismatch", REQUIRED_FILES[name]);
    return;
  }
  if (name === "signingPlan") {
    addCheck(checks, diagnostics, "signing-requests", sameKeySet(artifactsFromEntries(file, "requests"), artifacts), "sign-plan.json requests match verified artifacts.", "gate-artifact-mismatch", REQUIRED_FILES[name]);
  }
}

export async function verifyGateDirectory(directory, { generatedAt = new Date().toISOString() } = {}) {
  const root = resolve(directory);
  const diagnostics = [];
  const files = Object.fromEntries(await Promise.all(Object.entries(REQUIRED_FILES).map(async ([key, name]) => [key, await readJsonFile(root, name, diagnostics)])));
  const checks = [];
  const verification = files.verification;
  const artifacts = Array.isArray(verification?.artifacts) ? verification.artifacts : [];
  const sbomDocuments = verification?.sbomDocuments ?? [];
  const source = verification?.source;
  const manifestName = verification?.manifest;

  addCheck(checks, diagnostics, "gate-files", diagnostics.length === 0, "All required release gate JSON files are present and valid JSON.", "gate-files-invalid", root);
  addCheck(checks, diagnostics, "verification", verification?.valid === true && artifacts.length > 0 && sourceKey(source) && typeof manifestName === "string", "verify.json contains verified artifact evidence.", "gate-verification-invalid", REQUIRED_FILES.verification);

  if (verification?.valid === true && artifacts.length > 0 && sourceKey(source) && typeof manifestName === "string") {
    for (const name of ["sbom", "smokePlan", "scanPlan", "signingPlan"]) {
      checkPlanConsistency({ checks, diagnostics, name, file: files[name], source, manifestName, artifacts });
    }

    addCheck(checks, diagnostics, "sbom-documents", sameDocumentSet(files.sbom?.documents ?? [], sbomDocuments), "sbom.json documents match verified build SBOM evidence.", "gate-sbom-document-mismatch", REQUIRED_FILES.sbom);
    addCheck(checks, diagnostics, "release-source", sourceKey(files.releasePlan?.source) === sourceKey(source), "release-plan.json source matches verify.json.", "gate-source-mismatch", REQUIRED_FILES.releasePlan);
    addCheck(checks, diagnostics, "release-manifest", files.releasePlan?.manifest?.name === manifestName, "release-plan.json manifest matches verify.json.", "gate-manifest-mismatch", REQUIRED_FILES.releasePlan);
    addCheck(checks, diagnostics, "release-verification", files.releasePlan?.verification?.valid === true && files.releasePlan?.verification?.manifest === manifestName && files.releasePlan?.verification?.artifactCount === artifacts.length, "release-plan.json verification summary matches verify.json.", "gate-release-verification-mismatch", REQUIRED_FILES.releasePlan);
    addCheck(checks, diagnostics, "release-gates", Array.isArray(files.releasePlan?.gates) && files.releasePlan.gates.length === 5, "release-plan.json contains the expected five review gates.", "gate-release-gates-invalid", REQUIRED_FILES.releasePlan);
    addCheck(checks, diagnostics, "release-sbom", sameKeySet(artifactsFromSbom(files.releasePlan?.plans?.sbom), artifacts), "release-plan embedded SBOM matches verified artifacts.", "gate-artifact-mismatch", REQUIRED_FILES.releasePlan);
    addCheck(checks, diagnostics, "release-smoke", sameKeySet(artifactsFromEntries(files.releasePlan?.plans?.smokePlan, "tests"), artifacts), "release-plan embedded smoke plan matches verified artifacts.", "gate-artifact-mismatch", REQUIRED_FILES.releasePlan);
    addCheck(checks, diagnostics, "release-scan", sameKeySet(artifactsFromEntries(files.releasePlan?.plans?.scanPlan, "requests"), artifacts), "release-plan embedded scan plan matches verified artifacts.", "gate-artifact-mismatch", REQUIRED_FILES.releasePlan);
    addCheck(checks, diagnostics, "release-signing", sameKeySet(artifactsFromEntries(files.releasePlan?.plans?.signingPlan, "requests"), artifacts), "release-plan embedded signing plan matches verified artifacts.", "gate-artifact-mismatch", REQUIRED_FILES.releasePlan);
  }

  const errors = diagnostics.filter((item) => item.severity === "error");
  return {
    schemaVersion: 1,
    generatedAt,
    valid: errors.length === 0,
    source: source ?? null,
    manifest: manifestName ?? null,
    artifactCount: artifacts.length,
    sbomDocumentCount: sbomDocuments.length,
    checks,
    errors,
    diagnostics
  };
}

export function formatGateVerification(report, format = "text") {
  if (format === "json") return JSON.stringify(report, null, 2);
  const lines = [
    `Release gate bundle: ${report.valid ? "valid" : "invalid"}`,
    `Artifacts: ${report.artifactCount}`,
    `Build SBOM documents: ${report.sbomDocumentCount}`
  ];
  if (report.source) lines.push(`Source: ${report.source.repository}@${report.source.commit}`);
  if (report.manifest) lines.push(`Manifest: ${report.manifest}`);
  for (const item of report.checks) lines.push(`${item.status.toUpperCase()} ${item.name}: ${item.message}`);
  for (const error of report.errors) lines.push(`ERROR ${error.path} [${error.code}]: ${error.message}`);
  return lines.join("\n");
}
