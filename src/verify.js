import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat, readFile } from "node:fs/promises";
import { basename, join, resolve, sep } from "node:path";

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

async function hashFile(path) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
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

  const names = new Set();
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
    artifacts.push({ name: artifact.name, size: stat.size, sha256 });
  }
  return { valid: true, manifest: manifestFile.name, source: manifest.source, artifacts };
}

export function formatArtifactVerification(result, format = "text") {
  if (format === "json") return JSON.stringify(result, null, 2);
  return `Verified ${result.artifacts.length} artifact(s) against ${result.manifest} from ${result.source.repository}@${result.source.commit}.`;
}
