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

test("all third-party workflow actions are pinned to immutable commits", async () => {
  const files = ["ci.yml", "materialize.yml", "build.yml", "release.yml"];
  for (const file of files) {
    const workflow = await readFile(new URL(`../.github/workflows/${file}`, import.meta.url), "utf8");
    const actions = [...workflow.matchAll(/^\s*-\s+uses:\s+[^@\s]+@([^\s#]+)/gm)];
    assert.ok(actions.length > 0, `${file} has no action references to verify`);
    for (const action of actions) {
      assert.match(action[1], /^[0-9a-f]{40}$/i, `${file} contains an unpinned action reference`);
    }
  }
});

test("workflow files parse as YAML and publish npm provenance", async () => {
  const files = ["ci.yml", "materialize.yml", "build.yml", "release.yml"];
  for (const file of files) {
    const workflow = await readFile(new URL(`../.github/workflows/${file}`, import.meta.url), "utf8");
    assert.equal(parseDocument(workflow, { uniqueKeys: true }).errors.length, 0, `${file} is not valid YAML`);
  }
  const release = await readFile(new URL("../.github/workflows/release.yml", import.meta.url), "utf8");
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
