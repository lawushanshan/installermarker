#!/usr/bin/env node

import { analyzeRepository } from "../src/analyze.js";
import { buildRecipe } from "../src/build.js";
import { writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { materializeRecipe } from "../src/materialize.js";
import { formatRecipe, formatReport } from "../src/output.js";
import { parseArguments, usage } from "../src/cli.js";
import { readRecipe } from "../src/recipe-file.js";
import { createBuildPlan, createMaterializationPlan, formatValidationReport, validateRecipe } from "../src/validate.js";
import { formatArtifactVerification, verifyArtifactDirectory } from "../src/verify.js";

const require = createRequire(import.meta.url);
const { version } = require("../package.json");

async function main() {
  let options;
  try {
    options = parseArguments(process.argv.slice(2));
  } catch (error) {
    console.error(`Error: ${error.message}`);
    console.error(usage());
    process.exitCode = 2;
    return;
  }

  if (options.help) {
    console.log(usage());
    return;
  }
  if (options.version) {
    console.log(version);
    return;
  }

  try {
    if (options.command === "validate") {
      const result = validateRecipe(await readRecipe(options.recipeFile, { root: options.recipeRoot }));
      console.log(formatValidationReport(result, options.format));
      if (!result.valid || (options.strict && result.warnings.length > 0)) process.exitCode = 1;
      return;
    }

    if (options.command === "verify") {
      console.log(formatArtifactVerification(await verifyArtifactDirectory(options.artifactDirectory), options.format));
      return;
    }

    if (options.command === "build") {
      const recipe = await readRecipe(options.recipeFile, { root: options.recipeRoot });
      if (options.dryRun) {
        console.log(JSON.stringify(createBuildPlan(recipe, options.targetPlatform), null, 2));
        return;
      }
      const manifest = await buildRecipe(recipe, {
        targetPlatform: options.targetPlatform,
        workspace: options.workspace,
        outputDir: options.outputDir,
        allowUnsafeLocalBuild: options.allowUnsafeLocalBuild
      });
      console.log(`Built and verified ${manifest.artifacts.length} installer(s) in ${options.outputDir}`);
      return;
    }

    if (options.command === "materialize") {
      const recipe = await readRecipe(options.recipeFile, { root: options.recipeRoot });
      if (options.dryRun) {
        console.log(JSON.stringify(createMaterializationPlan(recipe), null, 2));
        return;
      }
      const manifest = await materializeRecipe(recipe, { fetch: globalThis.fetch, outputDir: options.outputDir, targetPlatform: options.targetPlatform });
      console.log(`Materialized ${manifest.artifacts.length} verified installer(s) in ${options.outputDir}`);
      return;
    }

    const report = await analyzeRepository(options.url, {
      token: options.token,
      fetch: globalThis.fetch
    });
    const output = options.recipe ? formatRecipe(report, options.format) : formatReport(report, options.format);
    if (options.output) {
      try {
        await writeFile(options.output, output.endsWith("\n") ? output : `${output}\n`, { flag: options.force ? "w" : "wx" });
      } catch (error) {
        if (error.code === "EEXIST") throw new Error(`Output file already exists: ${options.output}. Use --force to replace it.`);
        throw error;
      }
      console.error(`Wrote ${options.output}`);
    } else {
      console.log(output);
    }
  } catch (error) {
    const operation = options.command === "materialize" ? "Materialization" : options.command === "build" ? "Build" : options.command === "validate" ? "Validation" : options.command === "verify" ? "Verification" : "Analysis";
    console.error(`${operation} failed: ${error.message}`);
    process.exitCode = 1;
  }
}

main();
