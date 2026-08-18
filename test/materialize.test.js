import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { materializeRecipe } from "../src/materialize.js";
import { createMaterializationPlan } from "../src/validate.js";

function recipeFor(payload, overrides = {}) {
  const sha256 = createHash("sha256").update(payload).digest("hex");
  return {
    schemaVersion: 1,
    source: { repository: "https://github.com/acme/widget", branch: "main", commit: "a".repeat(40) },
    application: { name: "widget", entrypoint: "widget" },
    build: { strategy: "reuse-release", command: "none" },
    targets: [{
      platform: "windows-x64",
      status: "available",
      packaging: "reuse-installer",
      input: {
        name: "widget-amd64.msi",
        url: "https://github.com/acme/widget/releases/download/v1.0.0/widget-amd64.msi",
        size: payload.length,
        digest: `sha256:${sha256}`,
        ...overrides
      }
    }],
    review: []
  };
}

function assetResponse(payload) {
  const response = new Response(payload, { status: 200, headers: { "content-length": String(payload.length) } });
  Object.defineProperty(response, "url", { value: "https://release-assets.githubusercontent.com/github-production-release-asset/widget" });
  return response;
}

test("materializes a verified installer and provenance manifest", async () => {
  const payload = Buffer.from("verified installer payload");
  const directory = await mkdtemp(join(tmpdir(), "installermarker-test-"));
  try {
    const manifest = await materializeRecipe(recipeFor(payload), {
      outputDir: directory,
      fetch: async () => assetResponse(payload)
    });
    assert.equal(await readFile(join(directory, "widget-amd64.msi"), "utf8"), payload.toString());
    assert.equal(manifest.artifacts[0].platform, "windows-x64");
    assert.equal(manifest.source.license, undefined);
    assert.deepEqual(JSON.parse(await readFile(join(directory, "artifacts.json"), "utf8")), manifest);
    assert.deepEqual((await readdir(directory)).sort(), ["artifacts.json", "widget-amd64.msi"]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("records license evidence in the materialized artifact manifest", async () => {
  const payload = Buffer.from("verified installer payload");
  const directory = await mkdtemp(join(tmpdir(), "installermarker-test-"));
  try {
    const recipe = recipeFor(payload);
    recipe.source.license = "MIT";
    const manifest = await materializeRecipe(recipe, { outputDir: directory, fetch: async () => assetResponse(payload) });
    assert.equal(manifest.source.license, "MIT");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("rejects release assets from a different repository", () => {
  const payload = Buffer.from("payload");
  const recipe = recipeFor(payload, { url: "https://github.com/other/project/releases/download/v1/file.msi" });
  assert.throws(() => createMaterializationPlan(recipe), /source repository's GitHub Releases/);
});

test("rejects missing digests before downloading", () => {
  const payload = Buffer.from("payload");
  assert.throws(() => createMaterializationPlan(recipeFor(payload, { digest: null })), /SHA-256 digest is required/);
});

test("rejects installer formats that do not match the target", () => {
  const payload = Buffer.from("payload");
  const recipe = recipeFor(payload, {
    name: "widget-amd64.pkg",
    url: "https://github.com/acme/widget/releases/download/v1.0.0/widget-amd64.pkg"
  });
  assert.throws(() => createMaterializationPlan(recipe), /not a supported installer format/);
});

test("rejects a filename that differs from the release URL", () => {
  const payload = Buffer.from("payload");
  const recipe = recipeFor(payload, { name: "renamed.msi" });
  assert.throws(() => createMaterializationPlan(recipe), /filename must match/);
});

test("removes staged files when digest verification fails", async () => {
  const expected = Buffer.from("expected payload");
  const actual = Buffer.from("different payload!");
  const directory = await mkdtemp(join(tmpdir(), "installermarker-test-"));
  try {
    await assert.rejects(() => materializeRecipe(recipeFor(expected, { size: actual.length }), {
      outputDir: directory,
      fetch: async () => assetResponse(actual)
    }), /SHA-256 mismatch/);
    assert.deepEqual(await readdir(directory), []);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("refuses to overwrite existing outputs", async () => {
  const payload = Buffer.from("verified installer payload");
  const directory = await mkdtemp(join(tmpdir(), "installermarker-test-"));
  try {
    const options = { outputDir: directory, fetch: async () => assetResponse(payload) };
    await materializeRecipe(recipeFor(payload), options);
    await assert.rejects(() => materializeRecipe(recipeFor(payload), options), /Refusing to overwrite/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("reports the installer name and network cause on download failure", async () => {
  const payload = Buffer.from("verified installer payload");
  const directory = await mkdtemp(join(tmpdir(), "installermarker-test-"));
  try {
    const networkError = new TypeError("fetch failed", { cause: new Error("connection timed out") });
    await assert.rejects(() => materializeRecipe(recipeFor(payload), {
      outputDir: directory,
      networkRetries: 0,
      fetch: async () => { throw networkError; }
    }), /widget-amd64\.msi after 1 attempts: connection timed out/);
    assert.deepEqual(await readdir(directory), []);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("wraps timeouts raised while streaming the response body", async () => {
  // 模拟真实慢网络：响应头已到达，body 流式读取因超时中止
  const payload = Buffer.from("verified installer payload");
  const directory = await mkdtemp(join(tmpdir(), "installermarker-test-"));
  try {
    const timeout = new Error("The operation was aborted due to timeout");
    timeout.name = "TimeoutError";
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array([104, 101, 108, 108, 111]));
        setTimeout(() => controller.error(timeout), 10);
      }
    });
    const response = new Response(body, { status: 200, headers: { "content-length": String(payload.length) } });
    Object.defineProperty(response, "url", { value: "https://release-assets.githubusercontent.com/github-production-release-asset/widget" });
    await assert.rejects(() => materializeRecipe(recipeFor(payload), {
      outputDir: directory,
      fetch: async () => response
    }), /Download of widget-amd64\.msi timed out after 600000ms.*INSTALLERMARKER_DOWNLOAD_TIMEOUT_MS/);
    assert.deepEqual(await readdir(directory), []);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("wraps timeouts raised before response headers arrive without retrying", async () => {
  const payload = Buffer.from("verified installer payload");
  const directory = await mkdtemp(join(tmpdir(), "installermarker-test-"));
  try {
    const timeout = new Error("The operation was aborted due to timeout");
    timeout.name = "TimeoutError";
    let attempts = 0;
    await assert.rejects(() => materializeRecipe(recipeFor(payload), {
      outputDir: directory,
      networkRetries: 2,
      fetch: async () => {
        attempts += 1;
        throw timeout;
      }
    }), /Download of widget-amd64\.msi timed out after 600000ms.*INSTALLERMARKER_DOWNLOAD_TIMEOUT_MS/);
    assert.equal(attempts, 1);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("accepts a custom download timeout", async () => {
  const payload = Buffer.from("verified installer payload");
  const directory = await mkdtemp(join(tmpdir(), "installermarker-test-"));
  try {
    const timeout = new Error("The operation was aborted due to timeout");
    timeout.name = "TimeoutError";
    await assert.rejects(() => materializeRecipe(recipeFor(payload), {
      outputDir: directory,
      downloadTimeoutMs: 30_000,
      fetch: async () => { throw timeout; }
    }), /timed out after 30000ms/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("retries a transient asset download failure before verification", async () => {
  const payload = Buffer.from("verified installer payload");
  const directory = await mkdtemp(join(tmpdir(), "installermarker-test-"));
  let attempts = 0;
  try {
    const manifest = await materializeRecipe(recipeFor(payload), {
      outputDir: directory,
      networkRetries: 1,
      fetch: async () => {
        attempts += 1;
        if (attempts === 1) throw new TypeError("fetch failed", { cause: new Error("connection reset") });
        return assetResponse(payload);
      }
    });
    assert.equal(attempts, 2);
    assert.equal(manifest.artifacts[0].sha256.length, 64);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});