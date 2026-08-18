import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { formatArtifactVerification } from "../src/verify.js";
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
    assert.equal(result.artifacts[0].platform, "windows-x64");
    assert.equal(Object.prototype.propertyIsEnumerable.call(result, "manifestData"), false);
    assert.doesNotMatch(formatArtifactVerification(result, "json"), /manifestData/);
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

test("verifies source-build SBOM documents listed in the manifest", async () => {
  const directory = await mkdtemp(join(tmpdir(), "installermarker-verify-test-"));
  const artifactPayload = Buffer.from("built installer");
  const sbomPayload = Buffer.from("{\"bomFormat\":\"CycloneDX\"}");
  try {
    await writeFile(join(directory, "widget.AppImage"), artifactPayload);
    await writeFile(join(directory, "widget.cdx.json"), sbomPayload);
    await writeFile(join(directory, "build-artifacts.json"), `${JSON.stringify({
      schemaVersion: 1,
      source: { repository: "https://github.com/acme/widget", commit: "a".repeat(40) },
      build: { strategy: "go-native", command: "reviewed-native-packager", platform: "linux-x64" },
      provenance: {
        startedAt: "2026-01-01T00:00:00.000Z",
        finishedAt: "2026-01-01T00:00:01.000Z",
        durationMs: 1000,
        runner: { nodeVersion: "v22.0.0", platform: "linux", arch: "x64" }
      },
      sbom: {
        documents: [{
          name: "widget.cdx.json",
          format: "cyclonedx",
          size: sbomPayload.length,
          sha256: createHash("sha256").update(sbomPayload).digest("hex"),
          sourcePath: "dist/widget.cdx.json"
        }]
      },
      artifacts: [{
        platform: "linux-x64",
        name: "widget.AppImage",
        size: artifactPayload.length,
        sha256: createHash("sha256").update(artifactPayload).digest("hex"),
        sourcePath: "dist/widget.AppImage"
      }]
    })}\n`);
    const result = await verifyArtifactDirectory(directory);
    assert.equal(result.sbomDocuments[0].name, "widget.cdx.json");
    assert.equal(result.sbomDocuments[0].format, "cyclonedx");
    assert.match(formatArtifactVerification(result), /1 SBOM document/);

    await writeFile(join(directory, "widget.cdx.json"), "tampered sbom");
    await assert.rejects(() => verifyArtifactDirectory(directory), /SBOM document size mismatch|SBOM document SHA-256 mismatch/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
