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
import { createSigningPlan, formatSigningPlan } from "../src/signing.js";

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

test("creates a plan-only signing plan from verified artifacts", () => {
  const plan = createSigningPlan(verification(), { generatedAt: "2026-01-01T00:00:00.000Z" });
  assert.equal(plan.execution.mode, "plan-only");
  assert.equal(plan.requests.length, 3);
  assert.deepEqual(plan.requests.map((request) => request.profile), ["windows-authenticode", "macos-developer-id", "linux-detached-signature"]);
  assert.equal(plan.requests[0].stages.includes("authenticode-sign"), true);
  assert.equal(plan.requests[1].stages.includes("notarize"), true);
  assert.match(formatSigningPlan(plan, "text"), /does not sign artifacts/);
});

test("signing plans satisfy the schema contract", async () => {
  const schema = JSON.parse(await readFile(new URL("../schema/signing-plan.schema.json", import.meta.url), "utf8"));
  const ajv = new Ajv2020({ strict: true });
  addFormats(ajv);
  const validate = ajv.compile(schema);
  assert.equal(validate(createSigningPlan(verification(), { generatedAt: "2026-01-01T00:00:00.000Z" })), true);
});

test("rejects artifacts whose extension does not match the signing platform", () => {
  const invalid = verification();
  invalid.artifacts[0].name = "widget.dmg";
  assert.throws(() => createSigningPlan(invalid), /does not match/);
});

test("sign-plan command emits JSON for a verified materialized directory", async () => {
  const directory = await mkdtemp(join(tmpdir(), "installermarker-signing-"));
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
    const result = await run(process.execPath, ["./bin/installermarker.js", "sign-plan", directory, "--json"], { cwd: process.cwd() });
    const plan = JSON.parse(result.stdout);
    assert.equal(plan.execution.mode, "plan-only");
    assert.equal(plan.requests[0].profile, "windows-authenticode");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
