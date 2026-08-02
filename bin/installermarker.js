#!/usr/bin/env node

import { analyzeRepository } from "../src/analyze.js";
import { buildRecipe } from "../src/build.js";
import { formatGateVerification, verifyGateDirectory } from "../src/gate.js";
import { writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { materializeRecipe } from "../src/materialize.js";
import { formatRecipe, formatReport } from "../src/output.js";
import { createPublishPlanFromFiles, formatPublishPlan } from "../src/publish-plan.js";
import { formatPublishVerification, readPublishResult, verifyPublishResult } from "../src/publish-result.js";
import { createReleasePlan, formatReleasePlan } from "../src/release-plan.js";
import { formatReleaseVerification, readReleaseVerification, verifyReleaseEvidence } from "../src/release-verification.js";
import { createScanPlan, formatScanPlan } from "../src/scan.js";
import { formatScanVerification, readScanResult, verifyScanResult } from "../src/scan-result.js";
import { formatSignVerification, readSignResult, verifySignResult } from "../src/sign-result.js";
import { createSigningPlan, formatSigningPlan } from "../src/signing.js";
import { createArtifactSbom, formatArtifactSbom } from "../src/sbom.js";
import { createSmokePlan, formatSmokePlan } from "../src/smoke.js";
import { formatSmokeVerification, readSmokeResult, verifySmokeResult } from "../src/smoke-result.js";
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

    if (options.command === "sbom") {
      const verification = await verifyArtifactDirectory(options.artifactDirectory);
      console.log(formatArtifactSbom(createArtifactSbom(verification), options.format));
      return;
    }

    if (options.command === "smoke-plan") {
      const verification = await verifyArtifactDirectory(options.artifactDirectory);
      console.log(formatSmokePlan(createSmokePlan(verification), options.format));
      return;
    }

    if (options.command === "sign-plan") {
      const verification = await verifyArtifactDirectory(options.artifactDirectory);
      console.log(formatSigningPlan(createSigningPlan(verification), options.format));
      return;
    }

    if (options.command === "sign-verify") {
      const verification = await verifyArtifactDirectory(options.artifactDirectory);
      const result = verifySignResult(verification, await readSignResult(options.resultFile));
      console.log(formatSignVerification(result, options.format));
      if (!result.valid) process.exitCode = 1;
      return;
    }

    if (options.command === "scan-plan") {
      const verification = await verifyArtifactDirectory(options.artifactDirectory);
      console.log(formatScanPlan(createScanPlan(verification), options.format));
      return;
    }

    if (options.command === "scan-verify") {
      const verification = await verifyArtifactDirectory(options.artifactDirectory);
      const result = verifyScanResult(verification, await readScanResult(options.resultFile));
      console.log(formatScanVerification(result, options.format));
      if (!result.valid) process.exitCode = 1;
      return;
    }

    if (options.command === "smoke-verify") {
      const verification = await verifyArtifactDirectory(options.artifactDirectory);
      const result = verifySmokeResult(verification, await readSmokeResult(options.resultFile));
      console.log(formatSmokeVerification(result, options.format));
      if (!result.valid) process.exitCode = 1;
      return;
    }

    if (options.command === "release-plan") {
      const verification = await verifyArtifactDirectory(options.artifactDirectory);
      console.log(formatReleasePlan(createReleasePlan(verification), options.format));
      return;
    }

    if (options.command === "release-verify") {
      const verification = await verifyArtifactDirectory(options.artifactDirectory);
      const result = verifyReleaseEvidence(verification, {
        smokeResult: await readSmokeResult(options.smokeResultFile),
        scanResult: await readScanResult(options.scanResultFile),
        signResult: await readSignResult(options.signResultFile)
      });
      console.log(formatReleaseVerification(result, options.format));
      if (!result.valid) process.exitCode = 1;
      return;
    }

    if (options.command === "publish-plan") {
      const verification = await verifyArtifactDirectory(options.artifactDirectory);
      const releaseVerification = await readReleaseVerification(options.releaseVerificationFile);
      console.log(formatPublishPlan(await createPublishPlanFromFiles(verification, releaseVerification, {
        artifactDirectory: options.artifactDirectory,
        releaseVerificationFile: options.releaseVerificationFile,
        releaseTag: options.releaseTag
      }), options.format));
      return;
    }

    if (options.command === "publish-verify") {
      const verification = await verifyArtifactDirectory(options.artifactDirectory);
      const releaseVerification = await readReleaseVerification(options.releaseVerificationFile);
      const result = await verifyPublishResult(verification, releaseVerification, await readPublishResult(options.resultFile), {
        artifactDirectory: options.artifactDirectory,
        releaseVerificationFile: options.releaseVerificationFile,
        releaseTag: options.releaseTag
      });
      console.log(formatPublishVerification(result, options.format));
      if (!result.valid) process.exitCode = 1;
      return;
    }

    if (options.command === "gate-verify") {
      const result = await verifyGateDirectory(options.gateDirectory);
      console.log(formatGateVerification(result, options.format));
      if (!result.valid) process.exitCode = 1;
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
    const operation = options.command === "materialize" ? "Materialization" : options.command === "build" ? "Build" : options.command === "validate" ? "Validation" : options.command === "verify" ? "Verification" : options.command === "sbom" ? "SBOM generation" : options.command === "smoke-plan" ? "Smoke plan generation" : options.command === "smoke-verify" ? "Smoke result verification" : options.command === "sign-plan" ? "Signing plan generation" : options.command === "sign-verify" ? "Signing result verification" : options.command === "scan-plan" ? "Scan plan generation" : options.command === "scan-verify" ? "Scan result verification" : options.command === "release-plan" ? "Release plan generation" : options.command === "release-verify" ? "Release evidence verification" : options.command === "publish-plan" ? "Publish plan generation" : options.command === "publish-verify" ? "Publish result verification" : options.command === "gate-verify" ? "Release gate verification" : "Analysis";
    console.error(`${operation} failed: ${error.message}`);
    process.exitCode = 1;
  }
}

main();
