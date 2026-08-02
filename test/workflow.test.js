import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parseDocument } from "yaml";

test("materialization workflow uses minimal permissions and no persisted checkout credentials", async () => {
  const workflow = await readFile(new URL("../.github/workflows/materialize.yml", import.meta.url), "utf8");
  assert.match(workflow, /permissions:\n  contents: read/);
  assert.match(workflow, /persist-credentials: false/);
  assert.match(workflow, /validate "\$\{\{ inputs\.recipe_path \}\}"/);
  assert.match(workflow, /materialize "\$\{\{ inputs\.recipe_path \}\}" --recipe-root "\$GITHUB_WORKSPACE" --output-dir/);
  assert.match(workflow, /--recipe-root "\$GITHUB_WORKSPACE"/);
  assert.doesNotMatch(workflow, /secrets\./);
});

test("source-build workflow protects execution with an environment and native target jobs", async () => {
  const workflow = await readFile(new URL("../.github/workflows/build.yml", import.meta.url), "utf8");
  assert.match(workflow, /permissions:\n  contents: read/);
  assert.match(workflow, /environment: source-build/);
  assert.match(workflow, /runs-on: windows-latest/);
  assert.match(workflow, /runs-on: macos-latest/);
  assert.match(workflow, /runs-on: ubuntu-latest/);
  assert.match(workflow, /--allow-unsafe-local-build/);
  assert.match(workflow, /--recipe-root/);
  assert.match(workflow, /persist-credentials: false/);
  assert.doesNotMatch(workflow, /secrets\./);
});

test("release-gate workflow composes review plans without secrets or execution", async () => {
  const workflow = await readFile(new URL("../.github/workflows/release-gate.yml", import.meta.url), "utf8");
  assert.match(workflow, /permissions:\n  actions: read\n  contents: read/);
  assert.match(workflow, /persist-credentials: false/);
  assert.match(workflow, /gh run download "\$\{\{ inputs\.source_run_id \}\}" --name "\$\{\{ inputs\.artifact_name \}\}"/);
  assert.match(workflow, /installermarker\.js verify/);
  assert.match(workflow, /installermarker\.js sbom/);
  assert.match(workflow, /installermarker\.js smoke-plan/);
  assert.match(workflow, /installermarker\.js scan-plan/);
  assert.match(workflow, /installermarker\.js sign-plan/);
  assert.match(workflow, /installermarker\.js release-plan/);
  assert.match(workflow, /installermarker\.js gate-verify/);
  assert.match(workflow, /gate-verification\.json/);
  assert.match(workflow, /release-gate-plans-\$\{\{ github\.run_id \}\}/);
  assert.doesNotMatch(workflow, /secrets\./);
  assert.doesNotMatch(workflow, /--allow-unsafe-local-build/);
  assert.doesNotMatch(workflow, /npm publish|gh release create|notarize|signtool|codesign/);
});

test("release evidence workflow verifies raw external results without secrets or execution", async () => {
  const workflow = await readFile(new URL("../.github/workflows/release-verify.yml", import.meta.url), "utf8");
  assert.match(workflow, /permissions:\n  actions: read\n  contents: read/);
  assert.match(workflow, /persist-credentials: false/);
  assert.match(workflow, /gh run download "\$\{\{ inputs\.source_run_id \}\}" --name "\$\{\{ inputs\.artifact_name \}\}"/);
  assert.match(workflow, /gh run download "\$\{\{ inputs\.evidence_run_id \}\}" --name "\$\{\{ inputs\.evidence_artifact_name \}\}"/);
  assert.match(workflow, /installermarker\.js release-verify/);
  assert.match(workflow, /--smoke-result "\$RUNNER_TEMP\/installermarker-release-results\/smoke-result\.json"/);
  assert.match(workflow, /--scan-result "\$RUNNER_TEMP\/installermarker-release-results\/scan-result\.json"/);
  assert.match(workflow, /--sign-result "\$RUNNER_TEMP\/installermarker-release-results\/sign-result\.json"/);
  assert.match(workflow, /release-verification\.json/);
  assert.match(workflow, /release-verification-\$\{\{ github\.run_id \}\}/);
  assert.doesNotMatch(workflow, /secrets\./);
  assert.doesNotMatch(workflow, /--allow-unsafe-local-build/);
  assert.doesNotMatch(workflow, /npm publish|gh release create|notarize|signtool|codesign/);
});

test("publish plan workflow generates draft asset plans without publishing", async () => {
  const workflow = await readFile(new URL("../.github/workflows/publish-plan.yml", import.meta.url), "utf8");
  assert.match(workflow, /permissions:\n  actions: read\n  contents: read/);
  assert.match(workflow, /persist-credentials: false/);
  assert.match(workflow, /SOURCE_RUN_ID: \$\{\{ inputs\.source_run_id \}\}/);
  assert.match(workflow, /SOURCE_ARTIFACT_NAME: \$\{\{ inputs\.artifact_name \}\}/);
  assert.match(workflow, /VERIFICATION_RUN_ID: \$\{\{ inputs\.verification_run_id \}\}/);
  assert.match(workflow, /VERIFICATION_ARTIFACT_NAME: \$\{\{ inputs\.verification_artifact_name \}\}/);
  assert.match(workflow, /RELEASE_TAG: \$\{\{ inputs\.release_tag \}\}/);
  assert.match(workflow, /gh run download "\$SOURCE_RUN_ID" --name "\$SOURCE_ARTIFACT_NAME"/);
  assert.match(workflow, /gh run download "\$VERIFICATION_RUN_ID" --name "\$VERIFICATION_ARTIFACT_NAME"/);
  assert.match(workflow, /installermarker\.js publish-plan/);
  assert.match(workflow, /--release-verification "\$RUNNER_TEMP\/installermarker-publish-evidence\/release-verification\.json"/);
  assert.match(workflow, /--release-tag "\$RELEASE_TAG"/);
  assert.match(workflow, /publish-plan\.json/);
  assert.match(workflow, /publish-plan-\$\{\{ github\.run_id \}\}/);
  assert.doesNotMatch(workflow, /secrets\./);
  assert.doesNotMatch(workflow, /--allow-unsafe-local-build/);
  assert.doesNotMatch(workflow, /npm publish|gh release create|notarize|signtool|codesign/);
});

test("all third-party workflow actions are pinned to immutable commits", async () => {
  const files = ["ci.yml", "materialize.yml", "build.yml", "release-gate.yml", "release-verify.yml", "publish-plan.yml", "release.yml", "scorecard.yml", "codeql.yml"];
  for (const file of files) {
    const workflow = await readFile(new URL(`../.github/workflows/${file}`, import.meta.url), "utf8");
    const actions = [...workflow.matchAll(/^\s*(?:-\s+)?uses:\s+[^@\s]+@([^\s#]+)/gm)];
    assert.ok(actions.length > 0, `${file} has no action references to verify`);
    for (const action of actions) {
      assert.match(action[1], /^[0-9a-f]{40}$/i, `${file} contains an unpinned action reference`);
    }
  }
});

test("workflow files parse as YAML and publish npm provenance", async () => {
  const files = ["ci.yml", "materialize.yml", "build.yml", "release-gate.yml", "release-verify.yml", "publish-plan.yml", "release.yml", "scorecard.yml", "codeql.yml"];
  for (const file of files) {
    const workflow = await readFile(new URL(`../.github/workflows/${file}`, import.meta.url), "utf8");
    assert.equal(parseDocument(workflow, { uniqueKeys: true }).errors.length, 0, `${file} is not valid YAML`);
  }
  const release = await readFile(new URL("../.github/workflows/release.yml", import.meta.url), "utf8");
  assert.match(release, /permissions:\n  contents: read/);
  assert.match(release, /jobs:\n  release:[\s\S]*?permissions:\n      contents: write/);
  assert.match(release, /package_version="\$\(node -p "require\('\.\/package\.json'\)\.version"\)/);
  assert.match(release, /attestations: write/);
  assert.match(release, /actions\/attest@508db95dd578ae2727ebd6217d5ba78e4fbda05d # v4\.2\.1/);
  assert.match(release, /id: assets/);
  assert.match(release, /artifacts=\(installermarker-\*\.tgz\)/);
  assert.match(release, /test "\$\{#artifacts\[@\]\}" -eq 1/);
  assert.match(release, /checksum="\$\{artifacts\[0\]\}\.sha256"/);
  assert.match(release, /sha256sum "\$\{artifacts\[0\]\}" > "\$checksum"/);
  assert.match(release, /subject-checksums: \$\{\{ steps\.assets\.outputs\.checksum \}\}/);
  assert.match(release, /gh release create "\$GITHUB_REF_NAME" "\$\{\{ steps\.assets\.outputs\.tarball \}\}" "\$\{\{ steps\.assets\.outputs\.checksum \}\}"/);
  assert.match(release, /GH_TOKEN: \$\{\{ github\.token \}\}/);
  assert.doesNotMatch(release, /softprops\/action-gh-release/);
  assert.match(release, /id-token: write/);
  assert.match(release, /npm publish --provenance/);
});

test("scorecard workflow keeps scanning permissions narrow and credentials ephemeral", async () => {
  const workflow = await readFile(new URL("../.github/workflows/scorecard.yml", import.meta.url), "utf8");
  assert.match(workflow, /permissions: read-all/);
  assert.match(workflow, /contents: read/);
  assert.match(workflow, /id-token: write/);
  assert.match(workflow, /security-events: write/);
  assert.match(workflow, /persist-credentials: false/);
  assert.match(workflow, /publish_results: true/);
  assert.match(workflow, /results_format: sarif/);
  assert.doesNotMatch(workflow, /secrets\./);
});

test("codeql workflow analyzes JavaScript with read-only checkout", async () => {
  const workflow = await readFile(new URL("../.github/workflows/codeql.yml", import.meta.url), "utf8");
  assert.match(workflow, /languages: javascript-typescript/);
  assert.match(workflow, /security-events: write/);
  assert.match(workflow, /persist-credentials: false/);
  assert.match(workflow, /github\/codeql-action\/init@f205ea1c3313d32999d8d6a48b4f6530d4437b38/);
  assert.match(workflow, /github\/codeql-action\/analyze@f205ea1c3313d32999d8d6a48b4f6530d4437b38/);
  assert.doesNotMatch(workflow, /secrets\./);
});
