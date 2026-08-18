import test from "node:test";
import assert from "node:assert/strict";
import { analyzeRepository } from "../src/analyze.js";

function jsonResponse(value, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });
}

test("analyzes static repository metadata without executing project code", async () => {
  const commitSha = "a".repeat(40);
  const treeSha = "b".repeat(40);
  const packageContent = Buffer.from(JSON.stringify({ name: "sample", dependencies: { electron: "1.0.0" } })).toString("base64");
  const goModContent = Buffer.from(`module example.com/sample

require github.com/acme/lib v1.2.3
`).toString("base64");
  const fetch = async (url) => {
    if (url.endsWith("/repos/acme/sample")) return jsonResponse({ name: "sample", description: "A sample app", homepage: "", default_branch: "main", pushed_at: "2026-01-01T00:00:00Z", license: { spdx_id: "MIT" } });
    if (url.endsWith("/commits/main")) return jsonResponse({ sha: commitSha, commit: { tree: { sha: treeSha }, committer: { date: "2026-01-01T00:00:00Z" } } });
    if (url.includes(`/git/trees/${treeSha}`)) return jsonResponse({ truncated: false, tree: [
      { path: "package.json", type: "blob" },
      { path: "package-lock.json", type: "blob" },
      { path: "go.mod", type: "blob" },
      { path: "go.sum", type: "blob" }
    ] });
    if (url.includes(`/contents/package.json?ref=${commitSha}`)) return jsonResponse({ encoding: "base64", size: packageContent.length, content: packageContent });
    if (url.includes(`/contents/go.mod?ref=${commitSha}`)) return jsonResponse({ encoding: "base64", size: goModContent.length, content: goModContent });
    if (url.endsWith("/releases/latest")) return jsonResponse({ assets: [{ name: "sample-win.msi", browser_download_url: "https://example.test/sample-win.msi", size: 1024, digest: "sha256:abc" }], tag_name: "v1.0.0", published_at: "2026-01-01T00:00:00Z", html_url: "https://example.test/release" });
    throw new Error(`Unexpected request: ${url}`);
  };

  const report = await analyzeRepository("https://github.com/acme/sample", { fetch });
  assert.equal(report.analysis.project.kind, "electron");
  assert.equal(report.source.commitSha, commitSha);
  assert.equal(report.source.treeSha, treeSha);
  assert.equal(report.analysis.dependencies.manifestCount, 2);
  assert.equal(report.analysis.dependencies.dependencyCount, 2);
  assert.equal(report.analysis.dependencies.lockfileCount, 2);
  assert.equal(report.analysis.dependencies.manifests[0].path, "go.mod");
  assert.equal(report.analysis.dependencies.manifests[0].locked, true);
  assert.equal(report.analysis.dependencies.manifests[1].path, "package.json");
  assert.equal(report.analysis.dependencies.manifests[1].locked, true);
  assert.equal(report.analysis.dependencyRisks.findingCount, 0);
  assert.equal(report.targets[0].status, "available");
  assert.equal(report.targets[0].selectedAsset.digest, "sha256:abc");
  assert.match(report.analysis.safety, /No repository code/);
});