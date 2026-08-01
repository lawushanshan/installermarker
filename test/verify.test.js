import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { verifyArtifactDirectory } from "../src/verify.js";

async function createArtifactDirectory(payload) {
  const directory = await mkdtemp(join(tmpdir(), "installermarker-verify-test-"));
  const name = "widget.msi";
  await writeFile(join(directory, name), payload);
  const manifest = {
    schemaVersion: 1,
    source: { repository: "https://github.com/acme/widget", commit: "a".repeat(40), license: "MIT" },
    artifacts: [{ platform: "windows-x64", name, size: payload.length, sha256: createHash("sha256").update(payload).digest("hex"), sourceUrl: "https://github.com/acme/widget/releases/download/v1/widget.msi" }],
    skipped: []
  };
  await writeFile(join(directory, "artifacts.json"), `${JSON.stringify(manifest)}\n`);
  return directory;
}

test("verifies a materialized artifact manifest and its bytes", async () => {
  const directory = await createArtifactDirectory(Buffer.from("verified installer"));
  try {
    const result = await verifyArtifactDirectory(directory);
    assert.equal(result.valid, true);
    assert.equal(result.manifest, "artifacts.json");
    assert.equal(result.source.license, "MIT");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("rejects a tampered artifact after materialization", async () => {
  const directory = await createArtifactDirectory(Buffer.from("verified installer"));
  try {
    await writeFile(join(directory, "widget.msi"), "tampered installer");
    await assert.rejects(() => verifyArtifactDirectory(directory), /size mismatch|SHA-256 mismatch/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
