import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { lstat, readFile } from "node:fs/promises";
import { basename, join, resolve, sep } from "node:path";
import { hashFile } from "./file-hash.js";

const manifestSchemas = {
  "artifacts.json": JSON.parse(await readFile(new URL("../schema/artifact-manifest.schema.json", import.meta.url), "utf8")),
  "build-artifacts.json": JSON.parse(await readFile(new URL("../schema/build-artifact-manifest.schema.json", import.meta.url), "utf8"))
};
const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);
const validateManifest = Object.fromEntries(Object.entries(manifestSchemas).map(([name, schema]) => [name, ajv.compile(schema)]));

async function existingPath(path) {
  try {
    return await lstat(path);
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

function resolveInside(root, name) {
  if (typeof name !== "string" || !name || basename(name) !== name || name === "." || name === "..") {
    throw new Error(`Artifact manifest contains an unsafe filename: ${name}`);
  }
  const path = resolve(root, name);
  if (!path.startsWith(`${root}${sep}`)) throw new Error(`Artifact path escapes its directory: ${name}`);
  return path;
}

export async function verifyArtifactDirectory(directory) {
  const root = resolve(directory);
  const rootStat = await existingPath(root);
  if (!rootStat) throw new Error(`Artifact directory does not exist: ${root}`);
  if (rootStat.isSymbolicLink() || !rootStat.isDirectory()) throw new Error(`Artifact directory must be a real directory: ${root}`);

  const candidates = [];
  for (const name of Object.keys(manifestSchemas)) {
    const path = join(root, name);
    const stat = await existingPath(path);
    if (stat) candidates.push({ name, path, stat });
  }
  if (candidates.length === 0) throw new Error(`No artifacts.json or build-artifacts.json found in: ${root}`);
  if (candidates.length > 1) throw new Error(`Artifact directory contains both supported manifest types: ${root}`);

  const manifestFile = candidates[0];
  if (manifestFile.stat.isSymbolicLink() || !manifestFile.stat.isFile()) throw new Error(`Artifact manifest must be a regular file: ${manifestFile.path}`);
  let manifest;
  try {
    manifest = JSON.parse(await readFile(manifestFile.path, "utf8"));
  } catch (error) {
    throw new Error(`Artifact manifest must be valid JSON: ${error.message}`);
  }
  const validate = validateManifest[manifestFile.name];
  if (!validate(manifest)) {
    const error = validate.errors[0];
    throw new Error(`Artifact manifest is invalid at ${error.instancePath || "/"}: ${error.message}`);
  }

  const names = new Set([manifestFile.name]);
  const artifacts = [];
  for (const artifact of manifest.artifacts) {
    if (names.has(artifact.name)) throw new Error(`Artifact manifest contains a duplicate filename: ${artifact.name}`);
    names.add(artifact.name);
    const path = resolveInside(root, artifact.name);
    const stat = await existingPath(path);
    if (!stat) throw new Error(`Artifact is missing: ${artifact.name}`);
    if (stat.isSymbolicLink() || !stat.isFile()) throw new Error(`Artifact must be a regular file: ${artifact.name}`);
    if (stat.size !== artifact.size) throw new Error(`Artifact size mismatch for ${artifact.name}: expected ${artifact.size}, received ${stat.size}.`);
    const sha256 = await hashFile(path);
    if (sha256 !== artifact.sha256) throw new Error(`Artifact SHA-256 mismatch for ${artifact.name}.`);
    artifacts.push({ platform: artifact.platform, name: artifact.name, size: stat.size, sha256 });
  }
  const sbomDocuments = [];
  for (const document of manifest.sbom?.documents ?? []) {
    if (names.has(document.name)) throw new Error(`Artifact manifest contains a duplicate filename: ${document.name}`);
    names.add(document.name);
    const path = resolveInside(root, document.name);
    const stat = await existingPath(path);
    if (!stat) throw new Error(`SBOM document is missing: ${document.name}`);
    if (stat.isSymbolicLink() || !stat.isFile()) throw new Error(`SBOM document must be a regular file: ${document.name}`);
    if (stat.size !== document.size) throw new Error(`SBOM document size mismatch for ${document.name}: expected ${document.size}, received ${stat.size}.`);
    const sha256 = await hashFile(path);
    if (sha256 !== document.sha256) throw new Error(`SBOM document SHA-256 mismatch for ${document.name}.`);
    sbomDocuments.push({ name: document.name, format: document.format, size: stat.size, sha256, sourcePath: document.sourcePath });
  }
  const result = { valid: true, manifest: manifestFile.name, source: manifest.source, artifacts, ...(sbomDocuments.length ? { sbomDocuments } : {}) };
  Object.defineProperty(result, "manifestData", { value: manifest, enumerable: false });
  return result;
}

export function formatArtifactVerification(result, format = "text") {
  if (format === "json") return JSON.stringify(result, null, 2);
  const sbomSummary = result.sbomDocuments?.length ? ` and ${result.sbomDocuments.length} SBOM document(s)` : "";
  return `Verified ${result.artifacts.length} artifact(s)${sbomSummary} against ${result.manifest} from ${result.source.repository}@${result.source.commit}.`;
}
