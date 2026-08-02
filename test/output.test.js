import test from "node:test";
import assert from "node:assert/strict";
import { formatReport } from "../src/output.js";

test("text reports include dependency risk scan findings", () => {
  const report = {
    source: {
      url: "https://github.com/acme/widget",
      license: "MIT",
      commitSha: "a".repeat(40)
    },
    application: {
      name: "widget"
    },
    analysis: {
      project: {
        kind: "node",
        evidence: "package.json found"
      },
      confidence: "medium",
      dependencies: {
        manifestCount: 1,
        dependencyCount: 1,
        lockfileCount: 1,
        manifests: [{
          path: "package.json",
          kind: "npm",
          packageName: "widget",
          scopes: { production: 1 },
          locked: true,
          lockfiles: [{ path: "package-lock.json", kind: "npm-package-lock" }]
        }],
        skipped: []
      },
      dependencyRisks: {
        findingCount: 1,
        severityCounts: { high: 1, medium: 0, low: 0 },
        findings: [{
          severity: "high",
          path: "package.json",
          code: "npm-local-reference",
          message: "Dependency local-lib uses a local workspace or file reference."
        }]
      },
      safety: "Static metadata inspection only. No repository code has been cloned or executed."
    },
    targets: [{
      label: "Linux x64",
      status: "needs_review",
      reason: "No target-specific release asset or verified cross-platform build signal"
    }]
  };

  const output = formatReport(report, "text");
  assert.match(output, /Dependency inventory: 1 manifest/);
  assert.match(output, /Dependency locks: 1 lockfile/);
  assert.match(output, /locked by package-lock\.json/);
  assert.match(output, /Dependency scan: 1 finding/);
  assert.match(output, /HIGH package\.json \[npm-local-reference\]/);
});
