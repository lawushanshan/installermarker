import test from "node:test";
import assert from "node:assert/strict";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { createReleasePlan, formatReleasePlan } from "../src/release-plan.js";

const run = promisify(execFile);

function verification() {
  const artifacts = [
    {
      platform: "windows-x64",
      name: "widget.msi",
      size: 11,
      sha256: "b".repeat(64)
    },
    {
      platform: "macos-universal",
      name: "widget.dmg",
      size: 12,
      sha256: "c".repeat(64)
    },
    {
      platform: "linux-x64",
      name: "widget.AppImage",
      size: 13,
      sha256: "d".repeat(64)
    }
  ];
  return {
    manifest: "artifacts.json",
    source: {
      repository: "https://github.com/acme/widget",
      commit: "a".repeat(40),
      license: "MIT"
    },
    artifacts,
    manifestData: {
      artifacts: artifacts.map((artifact) => ({
        ...artifact,
        sourceUrl: `https://github.com/acme/widget/releases/download/v1/${artifact.name}`
      }))
    }
  };
}

function buildVerification() {
  return {
    manifest: "build-artifacts.json",
    source: {
      repository: "https://github.com/acme/widget",
      commit: "a".repeat(40)
    },
    artifacts: [{
      platform: "linux-x64",
      name: "widget.AppImage",
      size: 13,
      sha256: "d".repeat(64)
    }],
    sbomDocuments: [{
      name: "widget.spdx.json",
      format: "spdx",
      size: 22,
      sha256: "e".repeat(64),
      sourcePath: "dist/widget.spdx.json"
    }],
    manifestData: {
      build: {
        strategy: "go-native",
        command: "reviewed-native-packager",
        platform: "linux-x64"
      },
      provenance: {
        startedAt: "2026-01-01T00:00:00.000Z",
        finishedAt: "2026-01-01T00:00:01.000Z",
        durationMs: 1000,
        runner: {
          nodeVersion: "v22.0.0",
          platform: "linux",
          arch: "x64"
        }
      },
      artifacts: [{
        platform: "linux-x64",
        name: "widget.AppImage",
        size: 13,
        sha256: "d".repeat(64),
        sourcePath: "dist/widget.AppImage"
      }],
      sbom: {
        documents: [{
          name: "widget.spdx.json",
          format: "spdx",
          size: 22,
          sha256: "e".repeat(64),
          sourcePath: "dist/widget.spdx.json"
        }]
      }
    }
  };
}

test("composes verified artifacts into a plan-only release gate", () => {
  const plan = createReleasePlan(verification(), { generatedAt: "2026-01-01T00:00:00.000Z" });
  assert.equal(plan.execution.mode, "plan-only");
  assert.equal(plan.verification.valid, true);
  assert.equal(plan.verification.artifactCount, 3);
  assert.deepEqual(plan.gates.map((gate) => gate.name), ["verify-artifacts", "sbom", "smoke-test", "artifact-scan", "signing"]);
  assert.equal(plan.gates[0].status, "verified");
  assert.equal(plan.gates.slice(1).every((gate) => gate.status === "planned"), true);
  assert.equal(plan.plans.sbom.components.length, 3);
  assert.equal(plan.plans.smokePlan.tests.length, 3);
  assert.equal(plan.plans.scanPlan.requests.length, 3);
  assert.equal(plan.plans.signingPlan.requests.length, 3);
  assert.match(formatReleasePlan(plan, "text"), /Release plan/);
  assert.match(formatReleasePlan(plan, "text"), /does not execute artifacts/);
});

test("release gate summarizes verified build SBOM documents", () => {
  const plan = createReleasePlan(buildVerification(), { generatedAt: "2026-01-01T00:00:00.000Z" });
  assert.equal(plan.plans.sbom.documents[0].name, "widget.spdx.json");
  assert.match(plan.gates.find((gate) => gate.name === "sbom").summary, /1 build SBOM document/);
});

test("release plans satisfy the schema contract", async () => {
  const schema = JSON.parse(await readFile(new URL("../schema/release-plan.schema.json", import.meta.url), "utf8"));
  const ajv = new Ajv2020({ strict: true });
  addFormats(ajv);
  const validate = ajv.compile(schema);
  assert.equal(validate(createReleasePlan(verification(), { generatedAt: "2026-01-01T00:00:00.000Z" })), true);
});

test("release-plan command emits JSON for a verified materialized directory", async () => {
  const directory = await mkdtemp(join(tmpdir(), "installermarker-release-plan-"));
  const payload = Buffer.from("installer bytes");
  const sha256 = createHash("sha256").update(payload).digest("hex");
  try {
    await writeFile(join(directory, "widget.msi"), payload);
    await writeFile(join(directory, "artifacts.json"), `${JSON.stringify({
      schemaVersion: 1,
      source: {
        repository: "https://github.com/acme/widget",
        commit: "a".repeat(40),
        license: "MIT"
      },
      artifacts: [{
        platform: "windows-x64",
        name: "widget.msi",
        size: payload.length,
        sha256,
        sourceUrl: "https://github.com/acme/widget/releases/download/v1/widget.msi"
      }],
      skipped: []
    }, null, 2)}\n`);
    const result = await run(process.execPath, ["./bin/installermarker.js", "release-plan", directory, "--json"], { cwd: process.cwd() });
    const plan = JSON.parse(result.stdout);
    assert.equal(plan.execution.mode, "plan-only");
    assert.equal(plan.verification.valid, true);
    assert.equal(plan.gates[0].name, "verify-artifacts");
    assert.equal(plan.plans.sbom.components[0].name, "widget.msi");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
