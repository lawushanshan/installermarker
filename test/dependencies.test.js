import test from "node:test";
import assert from "node:assert/strict";
import { assessDependencyRisks, extractDependencyInventory } from "../src/dependencies.js";

test("extracts dependency inventory from package.json and go.mod", () => {
  const inventory = extractDependencyInventory([
    {
      path: "package.json",
      content: JSON.stringify({
        name: "sample",
        dependencies: { electron: "1.0.0" },
        devDependencies: { vitest: "2.0.0" }
      })
    },
    {
      path: "go.mod",
      content: `module example.com/sample

require (
  github.com/acme/lib v1.2.3
  github.com/acme/other v0.0.0-20240101-abcdef
)
`
    },
    {
      path: "setup.py",
      content: "from setuptools import setup"
    }
  ], { paths: ["package.json", "package-lock.json", "go.mod", "go.sum", "setup.py"] });

  assert.equal(inventory.manifestCount, 2);
  assert.equal(inventory.dependencyCount, 4);
  assert.equal(inventory.lockfileCount, 2);
  assert.equal(inventory.manifests[0].path, "go.mod");
  assert.equal(inventory.manifests[0].locked, true);
  assert.deepEqual(inventory.manifests[0].lockfiles, [{ path: "go.sum", kind: "go-sum" }]);
  assert.equal(inventory.manifests[1].path, "package.json");
  assert.equal(inventory.manifests[1].scopes.production, 1);
  assert.equal(inventory.manifests[1].scopes.development, 1);
  assert.equal(inventory.manifests[1].locked, true);
  assert.deepEqual(inventory.manifests[1].lockfiles, [{ path: "package-lock.json", kind: "npm-package-lock" }]);
  assert.equal(inventory.skipped[0].path, "setup.py");
});

test("extracts dependency inventory from Cargo.toml and requirements.txt", () => {
  const inventory = extractDependencyInventory([
    {
      path: "Cargo.toml",
      content: `[package]
name = "sample"

[dependencies]
serde = "1.0"
toml = { version = "0.8", features = ["parse"] }

[dev-dependencies]
tempfile = "3"
`
    },
    {
      path: "requirements.txt",
      content: `flask==3.0.0
# comment
-r extras.txt
`
    }
  ]);

  assert.equal(inventory.manifestCount, 2);
  assert.equal(inventory.dependencyCount, 4);
  assert.equal(inventory.lockfileCount, 0);
  assert.equal(inventory.manifests[0].path, "Cargo.toml");
  assert.equal(inventory.manifests[0].locked, false);
  assert.equal(inventory.manifests[0].scopes.production, 2);
  assert.equal(inventory.manifests[0].scopes.development, 1);
  assert.equal(inventory.manifests[1].path, "requirements.txt");
  assert.equal(inventory.manifests[1].scopes.requirements, 1);
  assert.equal(inventory.manifests[1].notes[0], "Ignored requirements directive: -r extras.txt");
});

test("flags obvious dependency source and index risks", () => {
  const inventory = extractDependencyInventory([
    {
      path: "package.json",
      content: JSON.stringify({
        dependencies: {
          "local-lib": "file:../local",
          "remote-lib": "git+https://github.com/acme/remote.git",
          "loose-lib": "latest"
        }
      })
    },
    {
      path: "requirements.txt",
      content: `pkg @ git+https://github.com/acme/pkg.git
-r extras.txt
--extra-index-url https://example.test/simple
`
    },
    {
      path: "Cargo.toml",
      content: `[dependencies]
vendored = { path = "../vendor" }
`
    }
  ]);

  const risks = assessDependencyRisks(inventory);
  assert.equal(risks.findingCount, 7);
  assert.equal(risks.severityCounts.high, 4);
  assert.equal(risks.severityCounts.medium, 3);
  assert.equal(risks.findings.some((finding) => finding.code === "npm-local-reference"), true);
  assert.equal(risks.findings.some((finding) => finding.code === "npm-vcs-reference"), true);
  assert.equal(risks.findings.some((finding) => finding.code === "npm-broad-range"), true);
  assert.equal(risks.findings.some((finding) => finding.code === "pip-source-reference"), true);
  assert.equal(risks.findings.some((finding) => finding.code === "pip-requirement-include"), true);
  assert.equal(risks.findings.some((finding) => finding.code === "pip-index-directive"), true);
  assert.equal(risks.findings.some((finding) => finding.code === "cargo-source-reference"), true);
});
