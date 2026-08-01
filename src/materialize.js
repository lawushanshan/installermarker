import { createHash, randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { access, link, mkdir, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createMaterializationPlan } from "./validate.js";

const DEFAULT_MAX_BYTES = 1024 * 1024 * 1024;
const DEFAULT_NETWORK_RETRIES = 2;

function validateRedirectUrl(responseUrl) {
  const url = new URL(responseUrl);
  if (url.protocol !== "https:" || (url.hostname !== "github.com" && !url.hostname.endsWith(".githubusercontent.com"))) {
    throw new Error(`GitHub redirected the asset to an untrusted host: ${url.hostname}`);
  }
}

async function pathExists(path) {
  try {
    await access(path);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

function isRetryableStatus(status) {
  return status === 408 || status === 429 || status >= 500;
}

function waitForRetry(attempt) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, 250 * (attempt + 1)));
}

async function requestAsset(item, fetchImplementation, networkRetries) {
  let requestError;
  for (let attempt = 0; attempt <= networkRetries; attempt += 1) {
    let response;
    try {
      response = await fetchImplementation(item.url, { redirect: "follow", signal: AbortSignal.timeout(10 * 60_000) });
    } catch (error) {
      requestError = error;
      if (attempt === networkRetries) break;
      await waitForRetry(attempt);
      continue;
    }
    if (response.ok && response.body) return response;
    if (!isRetryableStatus(response.status) || attempt === networkRetries) throw new Error(`Download failed with HTTP ${response.status}: ${item.name}`);
    await response.body?.cancel();
    await waitForRetry(attempt);
  }
  const reason = requestError?.cause?.message ?? requestError?.message ?? "unknown network error";
  throw new Error(`Download request failed for ${item.name} after ${networkRetries + 1} attempts: ${reason}`);
}

async function downloadAndVerify(item, destination, fetchImplementation, maxBytes, networkRetries) {
  const response = await requestAsset(item, fetchImplementation, networkRetries);
  validateRedirectUrl(response.url || item.url);
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) throw new Error(`Download exceeds the ${maxBytes}-byte limit: ${item.name}`);

  const hash = createHash("sha256");
  let actualSize = 0;
  const observer = new Transform({
    transform(chunk, encoding, callback) {
      actualSize += chunk.length;
      if (actualSize > maxBytes) {
        callback(new Error(`Download exceeds the ${maxBytes}-byte limit: ${item.name}`));
        return;
      }
      hash.update(chunk);
      callback(null, chunk);
    }
  });
  await pipeline(Readable.fromWeb(response.body), observer, createWriteStream(destination, { flags: "wx" }));

  const actualSha256 = hash.digest("hex");
  if (actualSize !== item.expectedSize) throw new Error(`Size mismatch for ${item.name}: expected ${item.expectedSize}, received ${actualSize}.`);
  if (actualSha256 !== item.expectedSha256) throw new Error(`SHA-256 mismatch for ${item.name}.`);
  return { ...item, size: actualSize, sha256: actualSha256 };
}

export async function materializeRecipe(recipe, { fetch, outputDir, targetPlatform, maxBytes = DEFAULT_MAX_BYTES, networkRetries = DEFAULT_NETWORK_RETRIES } = {}) {
  if (typeof fetch !== "function") throw new Error("A fetch implementation is required.");
  if (!outputDir) throw new Error("An output directory is required.");
  if (!Number.isInteger(networkRetries) || networkRetries < 0 || networkRetries > 5) throw new Error("networkRetries must be an integer between 0 and 5.");
  const plan = createMaterializationPlan(recipe, { maxBytes, targetPlatform });
  const destination = resolve(outputDir);
  await mkdir(destination, { recursive: true });

  const manifestPath = join(destination, "artifacts.json");
  const finalPaths = plan.downloads.map((item) => join(destination, item.name));
  for (const path of [manifestPath, ...finalPaths]) {
    if (await pathExists(path)) throw new Error(`Refusing to overwrite existing output: ${path}`);
  }

  const staging = join(destination, `.installermarker-${randomUUID()}`);
  await mkdir(staging);
  const created = [];
  try {
    const verified = [];
    for (const item of plan.downloads) {
      verified.push(await downloadAndVerify(item, join(staging, item.name), fetch, maxBytes, networkRetries));
    }

    for (const item of verified) {
      const finalPath = join(destination, item.name);
      await link(join(staging, item.name), finalPath);
      created.push(finalPath);
    }
    const manifest = {
      schemaVersion: 1,
      source: plan.source,
      artifacts: verified.map((item) => ({
        platform: item.platform,
        name: item.name,
        size: item.size,
        sha256: item.sha256,
        sourceUrl: item.url
      })),
      skipped: plan.skipped
    };
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { flag: "wx" });
    created.push(manifestPath);
    return manifest;
  } catch (error) {
    await Promise.all(created.map((path) => rm(path, { force: true })));
    throw error;
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}
