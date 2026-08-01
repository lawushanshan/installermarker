import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { toYaml } from "../src/output.js";
import { readRecipe } from "../src/recipe-file.js";

test("reads YAML recipes while rejecting duplicate keys", async () => {
  const directory = await mkdtemp(join(tmpdir(), "installermarker-recipe-file-"));
  const yamlFile = join(directory, "recipe.yml");
  const duplicateFile = join(directory, "duplicate.yaml");
  try {
    await writeFile(yamlFile, `schemaVersion: 1
review: []
`);
    await writeFile(duplicateFile, `schemaVersion: 1
schemaVersion: 2
`);
    assert.deepEqual(await readRecipe(yamlFile), { schemaVersion: 1, review: [] });
    await assert.rejects(() => readRecipe(duplicateFile), /valid YAML.*Map keys must be unique/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("YAML output preserves empty arrays and objects", async () => {
  const directory = await mkdtemp(join(tmpdir(), "installermarker-recipe-file-"));
  const recipePath = join(directory, "empty-values.yaml");
  try {
    const value = { build: { artifactDirectories: [] }, review: [], metadata: {} };
    await writeFile(recipePath, toYaml(value));
    assert.deepEqual(await readRecipe(recipePath), value);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("recipe root rejects files outside its real directory", async () => {
  const directory = await mkdtemp(join(tmpdir(), "installermarker-recipe-file-"));
  const root = join(directory, "recipes");
  const outside = join(directory, "outside.json");
  try {
    await mkdir(root);
    await writeFile(outside, "{}\\n");
    await assert.rejects(() => readRecipe(outside, { root }), /must be inside the configured recipe root/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});