import test from "node:test";
import assert from "node:assert/strict";
import Ajv2020 from "ajv/dist/2020.js";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { buildRecipe, collectInstallers } from "../src/build.js";
import { createBuildPlan, validateRecipe } from "../src/validate.js";

const runCli = promisify(execFile);

function buildRecipeFixture() {
  return {
    schemaVersion: 1,
    source: { repository: "https://github.com/acme/widget", branch: "main", commit: "a".repeat(40) },
    application: { name: "widget", entrypoint: "widget" },
    build: { strategy: "electron", command: "npm ci && npm run dist", artifactDirectories: ["dist"] },
    targets: [{ platform: "windows-x64", status: "likely", packaging: "build-electron" }],
    review: []
  };
}

test("build-ready Electron recipes produce a fixed source-build plan", () => {
  const recipe = buildRecipeFixture();
  const result = validateRecipe(recipe);
  assert.equal(result.readyForBuild, true);
  assert.deepEqual(createBuildPlan(recipe, "windows-x64").target, {
    platform: "windows-x64",
    packaging: "build-electron",
    strategy: "electron",
    command: "npm ci && npm run dist",
    artifactDirectories: ["dist"]
  });
});

test("source builds require an explicit isolated-execution acknowledgement", async () => {
  await assert.rejects(() => buildRecipe(buildRecipeFixture(), {
    targetPlatform: "windows-x64",
    workspace: "/tmp/installermarker-build-workspace",
    outputDir: "/tmp/installermarker-build-output"
  }), /allow-unsafe-local-build/);
});

test("source builds refuse a mismatched host operating system", async () => {
  await assert.rejects(() => buildRecipe(buildRecipeFixture(), {
    targetPlatform: "windows-x64",
    workspace: "/tmp/installermarker-build-workspace",
    outputDir: "/tmp/installermarker-build-output",
    allowUnsafeLocalBuild: true,
    processPlatform: "linux"
  }), /matching host operating system/);
});

test("collects only platform-compatible installers from configured build directories", async () => {
  const directory = await mkdtemp(join(tmpdir(), "installermarker-build-test-"));
  try {
    await mkdir(join(directory, "dist", "nested"), { recursive: true });
    await writeFile(join(directory, "dist", "widget-setup.exe"), "installer");
    await writeFile(join(directory, "dist", "nested", "widget.msi"), "installer");
    await writeFile(join(directory, "dist", "notes.txt"), "not installer");
    assert.deepEqual((await collectInstallers(directory, ["dist"], "windows-x64")).map((path) => path.slice(directory.length + 1)), ["dist/nested/widget.msi", "dist/widget-setup.exe"]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("rejects symlinked artifact directories and oversized build artifacts", async () => {
  const directory = await mkdtemp(join(tmpdir(), "installermarker-build-test-"));
  try {
    const outside = join(directory, "outside");
    await mkdir(outside);
    await writeFile(join(outside, "widget.AppImage"), "installer");
    await symlink(outside, join(directory, "dist"), "dir");
    await assert.rejects(() => collectInstallers(directory, ["dist"], "linux-x64"), /must not be a symbolic link/);

    await rm(join(directory, "dist"));
    await mkdir(join(directory, "dist"));
    await writeFile(join(directory, "dist", "widget.AppImage"), "installer");
    await assert.rejects(() => collectInstallers(directory, ["dist"], "linux-x64", { maxBytes: 4 }), /artifact exceeds the 4-byte limit/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("build worker clones a pinned revision, publishes installers, and records hashes", async () => {
  const directory = await mkdtemp(join(tmpdir(), "installermarker-build-test-"));
  const workspace = join(directory, "workspace");
  const output = join(directory, "output");
  const recipe = buildRecipeFixture();
  recipe.targets[0].platform = "linux-x64";
  try {
    const run = async (command, args, options) => {
      assert.equal(options.env.GITHUB_TOKEN, undefined);
      assert.equal(options.env.GIT_CONFIG_NOSYSTEM, "1");
      if (command === "git" && args.includes("clone")) {
        assert.match(args[1], /^core\.hooksPath=/);
        await mkdir(args.at(-1), { recursive: true });
      }
      if (command === "git" && args.at(-1) === "HEAD") return { stdout: `${recipe.source.commit}\n`, stderr: "" };
      if (command === recipe.build.command) {
        await mkdir(join(options.cwd, "dist"), { recursive: true });
        await writeFile(join(options.cwd, "dist", "widget.AppImage"), "built installer");
      }
      return { stdout: "", stderr: "" };
    };
    const manifest = await buildRecipe(recipe, {
      targetPlatform: "linux-x64",
      workspace,
      outputDir: output,
      allowUnsafeLocalBuild: true,
      processPlatform: "linux",
      run
    });
    assert.equal(manifest.artifacts[0].name, "widget.AppImage");
    assert.equal(manifest.source.license, undefined);
    assert.equal(await readFile(join(output, "widget.AppImage"), "utf8"), "built installer");
    const savedManifest = JSON.parse(await readFile(join(output, "build-artifacts.json"), "utf8"));
    assert.equal(savedManifest.artifacts[0].sha256.length, 64);
    const schema = JSON.parse(await readFile(new URL("../schema/build-artifact-manifest.schema.json", import.meta.url), "utf8"));
    assert.equal(new Ajv2020({ strict: true }).compile(schema)(savedManifest), true);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("build worker executes a reviewed native packaging recipe", async () => {
  const directory = await mkdtemp(join(tmpdir(), "installermarker-build-test-"));
  const workspace = join(directory, "workspace");
  const output = join(directory, "output");
  const recipe = buildRecipeFixture();
  recipe.build = { strategy: "go-native", command: "reviewed-native-packager", artifactDirectories: ["packages"] };
  recipe.targets = [{ platform: "linux-x64", status: "likely", packaging: "build-native" }];
  try {
    const run = async (command, args, options) => {
      if (command === "git" && args.includes("clone")) await mkdir(args.at(-1), { recursive: true });
      if (command === "git" && args.at(-1) === "HEAD") return { stdout: `${recipe.source.commit}\n`, stderr: "" };
      if (command === recipe.build.command) {
        await mkdir(join(options.cwd, "packages"), { recursive: true });
        await writeFile(join(options.cwd, "packages", "widget.deb"), "native installer");
      }
      return { stdout: "", stderr: "" };
    };
    const manifest = await buildRecipe(recipe, {
      targetPlatform: "linux-x64",
      workspace,
      outputDir: output,
      allowUnsafeLocalBuild: true,
      processPlatform: "linux",
      run
    });
    assert.equal(manifest.build.strategy, "go-native");
    assert.equal(manifest.artifacts[0].name, "widget.deb");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("build dry-run is available without permitting source execution", async () => {
  const directory = await mkdtemp(join(tmpdir(), "installermarker-build-test-"));
  const recipePath = join(directory, "recipe.json");
  try {
    await writeFile(recipePath, JSON.stringify(buildRecipeFixture()));
    const result = await runCli(process.execPath, ["./bin/installermarker.js", "build", recipePath, "--target", "windows-x64", "--dry-run"], { cwd: process.cwd() });
    assert.match(result.stdout, /"strategy": "electron"/);
    assert.match(result.stdout, /"platform": "windows-x64"/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
