import test from "node:test";
import assert from "node:assert/strict";
import { parseArguments } from "../src/cli.js";
import { parseGitHubUrl } from "../src/github.js";

test("parses a repository URL and output options", () => {
  const options = parseArguments(["https://github.com/acme/widget", "--recipe", "--format", "yaml"]);
  assert.equal(options.url, "https://github.com/acme/widget");
  assert.equal(options.recipe, true);
  assert.equal(options.format, "yaml");
});

test("accepts SSH GitHub URLs", () => {
  assert.deepEqual(parseGitHubUrl("git@github.com:acme/widget.git"), { owner: "acme", repository: "widget" });
});

test("rejects unsupported URL hosts", () => {
  assert.throws(() => parseGitHubUrl("https://gitlab.com/acme/widget"), /GitHub repository URL/);
});

test("rejects options without a value", () => {
  assert.throws(() => parseArguments(["https://github.com/acme/widget", "--format"]), /requires a value/);
});

test("parses safe file output options", () => {
  const options = parseArguments(["https://github.com/acme/widget", "--recipe", "--output", "recipe.json", "--force"]);
  assert.equal(options.output, "recipe.json");
  assert.equal(options.force, true);
});

test("parses materialize commands", () => {
  const options = parseArguments(["materialize", "recipe.yaml", "--output-dir", "artifacts", "--recipe-root", "recipes", "--target", "linux-x64"]);
  assert.equal(options.command, "materialize");
  assert.equal(options.recipeFile, "recipe.yaml");
  assert.equal(options.outputDir, "artifacts");
  assert.equal(options.recipeRoot, "recipes");
  assert.equal(options.targetPlatform, "linux-x64");
});

test("allows materialize dry runs without an output directory", () => {
  const options = parseArguments(["materialize", "recipe.json", "--dry-run"]);
  assert.equal(options.dryRun, true);
});

test("requires a destination for materialization", () => {
  assert.throws(() => parseArguments(["materialize", "recipe.json"]), /requires --output-dir/);
});

test("parses validation commands and strict mode", () => {
  const options = parseArguments(["validate", "recipe.json", "--strict", "--format", "json"]);
  assert.equal(options.command, "validate");
  assert.equal(options.recipeFile, "recipe.json");
  assert.equal(options.strict, true);
  assert.equal(options.format, "json");
});

test("rejects materialization-only options for validation", () => {
  assert.throws(() => parseArguments(["validate", "recipe.json", "--output-dir", "artifacts"]), /validate accepts/);
});

test("parses explicit source-build acknowledgement", () => {
  const options = parseArguments(["build", "recipe.json", "--target", "linux-x64", "--workspace", "work", "--output-dir", "artifacts", "--allow-unsafe-local-build"]);
  assert.equal(options.command, "build");
  assert.equal(options.targetPlatform, "linux-x64");
  assert.equal(options.allowUnsafeLocalBuild, true);
});

test("parses artifact verification commands", () => {
  const options = parseArguments(["verify", "artifacts", "--json"]);
  assert.equal(options.command, "verify");
  assert.equal(options.artifactDirectory, "artifacts");
  assert.equal(options.format, "json");
});

test("parses artifact SBOM commands", () => {
  const options = parseArguments(["sbom", "artifacts", "--json"]);
  assert.equal(options.command, "sbom");
  assert.equal(options.artifactDirectory, "artifacts");
  assert.equal(options.format, "json");
});

test("parses smoke plan commands", () => {
  const options = parseArguments(["smoke-plan", "artifacts", "--json"]);
  assert.equal(options.command, "smoke-plan");
  assert.equal(options.artifactDirectory, "artifacts");
  assert.equal(options.format, "json");
});

test("parses signing plan commands", () => {
  const options = parseArguments(["sign-plan", "artifacts", "--json"]);
  assert.equal(options.command, "sign-plan");
  assert.equal(options.artifactDirectory, "artifacts");
  assert.equal(options.format, "json");
});

test("parses signing verification commands", () => {
  const options = parseArguments(["sign-verify", "artifacts", "--result", "sign-result.json", "--json"]);
  assert.equal(options.command, "sign-verify");
  assert.equal(options.artifactDirectory, "artifacts");
  assert.equal(options.resultFile, "sign-result.json");
  assert.equal(options.format, "json");
});

test("requires a signing result for signing verification", () => {
  assert.throws(() => parseArguments(["sign-verify", "artifacts"]), /requires --result/);
});

test("parses artifact scan plan commands", () => {
  const options = parseArguments(["scan-plan", "artifacts", "--json"]);
  assert.equal(options.command, "scan-plan");
  assert.equal(options.artifactDirectory, "artifacts");
  assert.equal(options.format, "json");
});

test("parses scan verification commands", () => {
  const options = parseArguments(["scan-verify", "artifacts", "--result", "scan-result.json", "--json"]);
  assert.equal(options.command, "scan-verify");
  assert.equal(options.artifactDirectory, "artifacts");
  assert.equal(options.resultFile, "scan-result.json");
  assert.equal(options.format, "json");
});

test("requires a scan result for scan verification", () => {
  assert.throws(() => parseArguments(["scan-verify", "artifacts"]), /requires --result/);
});

test("parses smoke verification commands", () => {
  const options = parseArguments(["smoke-verify", "artifacts", "--result", "smoke-result.json", "--json"]);
  assert.equal(options.command, "smoke-verify");
  assert.equal(options.artifactDirectory, "artifacts");
  assert.equal(options.resultFile, "smoke-result.json");
  assert.equal(options.format, "json");
});

test("requires a smoke result for smoke verification", () => {
  assert.throws(() => parseArguments(["smoke-verify", "artifacts"]), /requires --result/);
});

test("parses release plan commands", () => {
  const options = parseArguments(["release-plan", "artifacts", "--json"]);
  assert.equal(options.command, "release-plan");
  assert.equal(options.artifactDirectory, "artifacts");
  assert.equal(options.format, "json");
});

test("parses release verification commands", () => {
  const options = parseArguments(["release-verify", "artifacts", "--smoke-result", "smoke-result.json", "--scan-result", "scan-result.json", "--sign-result", "sign-result.json", "--json"]);
  assert.equal(options.command, "release-verify");
  assert.equal(options.artifactDirectory, "artifacts");
  assert.equal(options.smokeResultFile, "smoke-result.json");
  assert.equal(options.scanResultFile, "scan-result.json");
  assert.equal(options.signResultFile, "sign-result.json");
  assert.equal(options.format, "json");
});

test("requires all external results for release verification", () => {
  assert.throws(() => parseArguments(["release-verify", "artifacts", "--smoke-result", "smoke-result.json", "--scan-result", "scan-result.json"]), /requires --smoke-result/);
});

test("parses publish plan commands", () => {
  const options = parseArguments(["publish-plan", "artifacts", "--release-verification", "release-verification.json", "--release-tag", "v1.0.0", "--json"]);
  assert.equal(options.command, "publish-plan");
  assert.equal(options.artifactDirectory, "artifacts");
  assert.equal(options.releaseVerificationFile, "release-verification.json");
  assert.equal(options.releaseTag, "v1.0.0");
  assert.equal(options.format, "json");
});

test("requires release verification and tag for publish plans", () => {
  assert.throws(() => parseArguments(["publish-plan", "artifacts", "--release-verification", "release-verification.json"]), /requires --release-verification/);
});

test("parses release gate verification commands", () => {
  const options = parseArguments(["gate-verify", "release-gate", "--json"]);
  assert.equal(options.command, "gate-verify");
  assert.equal(options.gateDirectory, "release-gate");
  assert.equal(options.format, "json");
});

test("accepts a version request without a repository URL", () => {
  const options = parseArguments(["--version"]);
  assert.equal(options.version, true);
});
