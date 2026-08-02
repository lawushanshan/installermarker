const PROJECTION_COMMANDS = new Set(["sbom", "smoke-plan", "sign-plan", "scan-plan", "release-plan"]);
const GATE_COMMANDS = new Set(["gate-verify"]);
const RESULT_COMMANDS = new Set(["scan-verify", "smoke-verify", "sign-verify"]);
const RELEASE_VERIFY_COMMANDS = new Set(["release-verify"]);
const PUBLISH_PLAN_COMMANDS = new Set(["publish-plan"]);
const PUBLISH_VERIFY_COMMANDS = new Set(["publish-verify"]);
const ARTIFACT_DIRECTORY_COMMANDS = new Set(["verify", ...PROJECTION_COMMANDS]);
const COMMANDS = new Set(["inspect", "materialize", "validate", "build", ...ARTIFACT_DIRECTORY_COMMANDS, ...GATE_COMMANDS, ...RESULT_COMMANDS, ...RELEASE_VERIFY_COMMANDS, ...PUBLISH_PLAN_COMMANDS, ...PUBLISH_VERIFY_COMMANDS]);

export function parseArguments(argumentsList) {
  const args = [...argumentsList];
  const explicitCommand = COMMANDS.has(args[0]);
  const command = explicitCommand ? args.shift() : "inspect";
  const options = {
    command,
    format: "text",
    recipe: false,
    help: false,
    version: false,
    force: false,
    dryRun: false,
    strict: false,
    allowUnsafeLocalBuild: false,
    token: command === "inspect" ? process.env.GITHUB_TOKEN : undefined
  };

  const valueAfter = (index, option) => {
    const value = args[index + 1];
    if (!value || value.startsWith("-")) throw new Error(`${option} requires a value.`);
    return value;
  };

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--help" || argument === "-h") options.help = true;
    else if (argument === "--version" || argument === "-v") options.version = true;
    else if (argument === "--recipe") options.recipe = true;
    else if (argument === "--force") options.force = true;
    else if (argument === "--dry-run") options.dryRun = true;
    else if (argument === "--strict") options.strict = true;
    else if (argument === "--allow-unsafe-local-build") options.allowUnsafeLocalBuild = true;
    else if (argument === "--json") options.format = "json";
    else if (argument === "--format") {
      options.format = valueAfter(index, argument);
      index += 1;
    } else if (argument === "--token") {
      options.token = valueAfter(index, argument);
      index += 1;
    } else if (argument === "--result") {
      options.resultFile = valueAfter(index, argument);
      index += 1;
    } else if (argument === "--smoke-result") {
      options.smokeResultFile = valueAfter(index, argument);
      index += 1;
    } else if (argument === "--scan-result") {
      options.scanResultFile = valueAfter(index, argument);
      index += 1;
    } else if (argument === "--sign-result") {
      options.signResultFile = valueAfter(index, argument);
      index += 1;
    } else if (argument === "--release-verification") {
      options.releaseVerificationFile = valueAfter(index, argument);
      index += 1;
    } else if (argument === "--release-tag") {
      options.releaseTag = valueAfter(index, argument);
      index += 1;
    } else if (argument === "--output" || argument === "-o") {
      options.output = valueAfter(index, argument);
      index += 1;
    } else if (argument === "--output-dir") {
      options.outputDir = valueAfter(index, argument);
      index += 1;
    } else if (argument === "--workspace") {
      options.workspace = valueAfter(index, argument);
      index += 1;
    } else if (argument === "--recipe-root") {
      options.recipeRoot = valueAfter(index, argument);
      index += 1;
    } else if (argument === "--target") {
      options.targetPlatform = valueAfter(index, argument);
      index += 1;
    } else if (!argument.startsWith("-") && !options.input) options.input = argument;
    else throw new Error(`Unknown or repeated argument: ${argument}`);
  }

  if (!options.help && !options.version && !options.input) {
    throw new Error(command === "inspect" ? "A GitHub repository URL is required." : GATE_COMMANDS.has(command) ? "A release gate directory is required." : ARTIFACT_DIRECTORY_COMMANDS.has(command) || RESULT_COMMANDS.has(command) || RELEASE_VERIFY_COMMANDS.has(command) || PUBLISH_PLAN_COMMANDS.has(command) || PUBLISH_VERIFY_COMMANDS.has(command) ? "An artifact directory is required." : "A JSON or YAML recipe file is required.");
  }
  if (!["text", "json", "yaml"].includes(options.format)) throw new Error("--format must be text, json, or yaml.");

  if (command === "inspect") {
    options.url = options.input;
    if (options.outputDir || options.dryRun || options.workspace || options.recipeRoot || options.targetPlatform || options.allowUnsafeLocalBuild || options.resultFile || options.smokeResultFile || options.scanResultFile || options.signResultFile || options.releaseVerificationFile || options.releaseTag) throw new Error("Build, materialize, result, and publish options are not valid for inspect.");
  } else if (command === "materialize") {
    options.recipeFile = options.input;
    if (!options.help && !options.dryRun && !options.outputDir) throw new Error("materialize requires --output-dir unless --dry-run is used.");
    if (options.recipe || options.output || options.force || options.strict || options.workspace || options.allowUnsafeLocalBuild || options.resultFile || options.smokeResultFile || options.scanResultFile || options.signResultFile || options.releaseVerificationFile || options.releaseTag || options.format !== "text" || options.token) {
      throw new Error("materialize accepts only --output-dir, --target, and --dry-run options.");
    }
  } else if (command === "build") {
    options.recipeFile = options.input;
    if (!options.help && !options.targetPlatform) throw new Error("build requires --target.");
    if (!options.help && !options.dryRun && (!options.workspace || !options.outputDir)) throw new Error("build requires --workspace and --output-dir unless --dry-run is used.");
    if (options.recipe || options.output || options.force || options.strict || options.resultFile || options.smokeResultFile || options.scanResultFile || options.signResultFile || options.releaseVerificationFile || options.releaseTag || options.format !== "text" || options.token) {
      throw new Error("build accepts only --target, --workspace, --output-dir, --dry-run, and --allow-unsafe-local-build options.");
    }
  } else if (command === "validate") {
    options.recipeFile = options.input;
    if (options.recipe || options.output || options.force || options.dryRun || options.outputDir || options.workspace || options.targetPlatform || options.allowUnsafeLocalBuild || options.resultFile || options.smokeResultFile || options.scanResultFile || options.signResultFile || options.releaseVerificationFile || options.releaseTag || options.token) {
      throw new Error("validate accepts only --format, --json, and --strict options.");
    }
    if (options.format === "yaml") throw new Error("validate supports only text and json output.");
  } else if (PROJECTION_COMMANDS.has(command)) {
    options.artifactDirectory = options.input;
    if (options.recipe || options.output || options.force || options.dryRun || options.outputDir || options.workspace || options.recipeRoot || options.targetPlatform || options.allowUnsafeLocalBuild || options.resultFile || options.smokeResultFile || options.scanResultFile || options.signResultFile || options.releaseVerificationFile || options.releaseTag || options.token || options.strict) {
      throw new Error(`${command} accepts only --format and --json options.`);
    }
    if (options.format === "yaml") throw new Error(`${command} supports only text and json output.`);
  } else if (GATE_COMMANDS.has(command)) {
    options.gateDirectory = options.input;
    if (options.recipe || options.output || options.force || options.dryRun || options.outputDir || options.workspace || options.recipeRoot || options.targetPlatform || options.allowUnsafeLocalBuild || options.resultFile || options.smokeResultFile || options.scanResultFile || options.signResultFile || options.releaseVerificationFile || options.releaseTag || options.token || options.strict) {
      throw new Error(`${command} accepts only --format and --json options.`);
    }
    if (options.format === "yaml") throw new Error(`${command} supports only text and json output.`);
  } else if (RESULT_COMMANDS.has(command)) {
    options.artifactDirectory = options.input;
    if (!options.help && !options.resultFile) throw new Error(`${command} requires --result.`);
    if (options.recipe || options.output || options.force || options.dryRun || options.outputDir || options.workspace || options.recipeRoot || options.targetPlatform || options.allowUnsafeLocalBuild || options.smokeResultFile || options.scanResultFile || options.signResultFile || options.releaseVerificationFile || options.releaseTag || options.token || options.strict) {
      throw new Error(`${command} accepts only --result, --format, and --json options.`);
    }
    if (options.format === "yaml") throw new Error(`${command} supports only text and json output.`);
  } else if (RELEASE_VERIFY_COMMANDS.has(command)) {
    options.artifactDirectory = options.input;
    if (!options.help && (!options.smokeResultFile || !options.scanResultFile || !options.signResultFile)) throw new Error(`${command} requires --smoke-result, --scan-result, and --sign-result.`);
    if (options.recipe || options.output || options.force || options.dryRun || options.outputDir || options.workspace || options.recipeRoot || options.targetPlatform || options.allowUnsafeLocalBuild || options.resultFile || options.releaseVerificationFile || options.releaseTag || options.token || options.strict) {
      throw new Error(`${command} accepts only --smoke-result, --scan-result, --sign-result, --format, and --json options.`);
    }
    if (options.format === "yaml") throw new Error(`${command} supports only text and json output.`);
  } else if (PUBLISH_PLAN_COMMANDS.has(command)) {
    options.artifactDirectory = options.input;
    if (!options.help && (!options.releaseVerificationFile || !options.releaseTag)) throw new Error(`${command} requires --release-verification and --release-tag.`);
    if (options.recipe || options.output || options.force || options.dryRun || options.outputDir || options.workspace || options.recipeRoot || options.targetPlatform || options.allowUnsafeLocalBuild || options.resultFile || options.smokeResultFile || options.scanResultFile || options.signResultFile || options.token || options.strict) {
      throw new Error(`${command} accepts only --release-verification, --release-tag, --format, and --json options.`);
    }
    if (options.format === "yaml") throw new Error(`${command} supports only text and json output.`);
  } else if (PUBLISH_VERIFY_COMMANDS.has(command)) {
    options.artifactDirectory = options.input;
    if (!options.help && (!options.resultFile || !options.releaseVerificationFile || !options.releaseTag)) throw new Error(`${command} requires --result, --release-verification, and --release-tag.`);
    if (options.recipe || options.output || options.force || options.dryRun || options.outputDir || options.workspace || options.recipeRoot || options.targetPlatform || options.allowUnsafeLocalBuild || options.smokeResultFile || options.scanResultFile || options.signResultFile || options.token || options.strict) {
      throw new Error(`${command} accepts only --result, --release-verification, --release-tag, --format, and --json options.`);
    }
    if (options.format === "yaml") throw new Error(`${command} supports only text and json output.`);
  } else {
    options.artifactDirectory = options.input;
    if (options.recipe || options.output || options.force || options.dryRun || options.outputDir || options.workspace || options.recipeRoot || options.targetPlatform || options.allowUnsafeLocalBuild || options.resultFile || options.smokeResultFile || options.scanResultFile || options.signResultFile || options.releaseVerificationFile || options.releaseTag || options.token || options.strict) {
      throw new Error("verify accepts only --format and --json options.");
    }
    if (options.format === "yaml") throw new Error("verify supports only text and json output.");
  }

  return options;
}

export function usage() {
  return `Usage:
  installermarker [inspect] <github-url> [options]
  installermarker materialize <recipe.(json|yaml)> --output-dir <directory>
  installermarker build <recipe.(json|yaml)> --target <platform> --workspace <directory> --output-dir <directory> --allow-unsafe-local-build
  installermarker validate <recipe.(json|yaml)> [--strict] [--format text|json]
  installermarker sbom <artifact-directory> [--format text|json]
  installermarker smoke-plan <artifact-directory> [--format text|json]
  installermarker smoke-verify <artifact-directory> --result <smoke-result.json> [--format text|json]
  installermarker sign-plan <artifact-directory> [--format text|json]
  installermarker sign-verify <artifact-directory> --result <sign-result.json> [--format text|json]
  installermarker scan-plan <artifact-directory> [--format text|json]
  installermarker scan-verify <artifact-directory> --result <scan-result.json> [--format text|json]
  installermarker release-plan <artifact-directory> [--format text|json]
  installermarker release-verify <artifact-directory> --smoke-result <smoke-result.json> --scan-result <scan-result.json> --sign-result <sign-result.json> [--format text|json]
  installermarker publish-plan <artifact-directory> --release-verification <release-verification.json> --release-tag <tag> [--format text|json]
  installermarker publish-verify <artifact-directory> --release-verification <release-verification.json> --release-tag <tag> --result <publish-result.json> [--format text|json]
  installermarker gate-verify <release-gate-directory> [--format text|json]
  installermarker verify <artifact-directory> [--format text|json]

Inspect options:
  --recipe             Output an editable installer recipe draft
  --format <format>    text, json, or yaml (default: text)
  --json               Alias for --format json
  -o, --output <file>  Write output to a file; refuses to overwrite by default
  --force              Allow --output to overwrite an existing file
  --token <token>      GitHub token, or use GITHUB_TOKEN

Materialize options:
  --output-dir <dir>   Directory for verified installers and artifacts.json
  --target <platform>  Materialize only windows-x64, macos-universal, or linux-x64
  --dry-run            Validate and print the download plan without writing
  --recipe-root <dir>  Require the recipe file to be inside this directory

Build options:
  --target <platform>  windows-x64, macos-universal, or linux-x64
  --workspace <dir>    New isolated checkout directory
  --output-dir <dir>   Directory for verified built installers
  --dry-run            Validate and print the source-build plan without executing
  --allow-unsafe-local-build
                      Explicitly permit reviewed source code execution in this environment
  --recipe-root <dir>  Require the recipe file to be inside this directory

Validate options:
  --strict             Treat unresolved warnings as a failure for CI
  --format <format>    text or json (default: text)
  --recipe-root <dir>  Require the recipe file to be inside this directory

Verify options:
  --format <format>    text or json (default: text)

General options:
  -h, --help           Show this help
  -v, --version        Show the installed version`;
}
