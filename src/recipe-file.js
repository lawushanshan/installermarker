import { readFile, realpath } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { parseDocument } from "yaml";

function parseJsonRecipe(content) {
  try {
    return JSON.parse(content);
  } catch (error) {
    throw new Error(`Recipe must be valid JSON: ${error.message}`);
  }
}

function parseYamlRecipe(content) {
  const document = parseDocument(content, { maxAliasCount: 0, uniqueKeys: true });
  if (document.errors.length > 0) throw new Error(`Recipe must be valid YAML: ${document.errors[0].message}`);
  try {
    return document.toJS({ maxAliasCount: 0 });
  } catch (error) {
    throw new Error(`Recipe must be valid YAML: ${error.message}`);
  }
}

async function resolveRecipePath(path, root) {
  const candidate = resolve(path);
  if (!root) return candidate;
  const [recipePath, recipeRoot] = await Promise.all([realpath(candidate), realpath(resolve(root))]);
  if (recipePath !== recipeRoot && !recipePath.startsWith(`${recipeRoot}${sep}`)) {
    throw new Error(`Recipe path must be inside the configured recipe root: ${recipeRoot}`);
  }
  return recipePath;
}

export async function readRecipe(path, { root } = {}) {
  let recipePath;
  let content;
  try {
    recipePath = await resolveRecipePath(path, root);
    content = await readFile(recipePath, "utf8");
  } catch (error) {
    throw new Error(`Cannot read recipe ${path}: ${error.message}`);
  }
  return recipePath.endsWith(".yaml") || recipePath.endsWith(".yml") ? parseYamlRecipe(content) : parseJsonRecipe(content);
}

// Kept for programmatic callers that used the initial JSON-only API.
export const readJsonRecipe = readRecipe;