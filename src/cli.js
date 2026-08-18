const OPTION_FIELDS = [
  "recipe",
  "output",
  "force",
  "dryRun",
  "outputDir",
  "workspace",
  "recipeRoot",
  "targetPlatform",
  "buildCommand",
  "artifactDirectory",
  "allowUnsafeLocalBuild",
  "resultFile",
  "smokeResultFile",
  "scanResultFile",
  "signResultFile",
  "releaseVerificationFile",
  "releaseTag",
  "token",
  "strict"
];

const textOnly = ["text"];
const textAndJson = ["text", "json"];
const allFormats = ["text", "json", "yaml"];

function artifactCommand(accepts = "accepts only --format and --json options.") {
  return {
    inputTarget: "artifactDirectory",
    missingInput: "An artifact directory is required.",
    allowed: ["format"],
    formats: textAndJson,
    accepts
  };
}

const COMMAND_SPECS = {
  inspect: {
    inputTarget: "url",
    missingInput: "A GitHub repository URL is required.",
    allowed: ["recipe", "format", "output", "force", "token"],
    formats: allFormats,
    accepts: "inspect accepts only --recipe, --output, --force, --token, --format, and --json options."
  },
  materialize: {
    inputTarget: "recipeFile",
    allowed: ["outputDir", "targetPlatform", "dryRun", "recipeRoot"],
    formats: textOnly,
    accepts: "materialize accepts only --output-dir, --target, --dry-run, and --recipe-root options.",
    validate(options) {
      if (!options.help && !options.dryRun && !options.outputDir) throw new Error("materialize requires --output-dir unless --dry-run is used.");
    }
  },
  build: {
    inputTarget: "recipeFile",
    allowed: ["targetPlatform", "workspace", "outputDir", "dryRun", "allowUnsafeLocalBuild", "recipeRoot"],
    formats: textOnly,
    accepts: "build accepts only --target, --workspace, --output-dir, --dry-run, --allow-unsafe-local-build, and --recipe-root options.",
    validate(options) {
      if (!options.help && !options.targetPlatform) throw new Error("build requires --target.");
      if (!options.help && !options.dryRun && (!options.workspace || !options.outputDir)) throw new Error("build requires --workspace and --output-dir unless --dry-run is used.");
    }
  },
  package: {
    inputTarget: "projectDirectory",
    missingInput: "A local project directory is required.",
    allowed: ["targetPlatform", "buildCommand", "artifactDirectory", "outputDir", "dryRun", "force"],
    formats: textOnly,
    accepts: "package accepts only --target, --command, --artifact-dir, --output-dir, --dry-run, and --force options."
  },
  validate: {
    inputTarget: "recipeFile",
    allowed: ["strict", "format", "recipeRoot"],
    formats: textAndJson,
    accepts: "validate accepts only --format, --json, --strict, and --recipe-root options."
  },
  verify: artifactCommand(),
  sbom: artifactCommand(),
  "smoke-plan": artifactCommand(),
  "sign-plan": artifactCommand(),
  "scan-plan": artifactCommand(),
  "release-plan": artifactCommand(),
  "gate-verify": {
    inputTarget: "gateDirectory",
    missingInput: "A release gate directory is required.",
    allowed: ["format"],
    formats: textAndJson,
    accepts: "gate-verify accepts only --format and --json options."
  },
  "scan-verify": {
    ...artifactCommand("scan-verify accepts only --result, --format, and --json options."),
    allowed: ["resultFile", "format"],
    validate(options) {
      if (!options.help && !options.resultFile) throw new Error("scan-verify requires --result.");
    }
  },
  "smoke-verify": {
    ...artifactCommand("smoke-verify accepts only --result, --format, and --json options."),
    allowed: ["resultFile", "format"],
    validate(options) {
      if (!options.help && !options.resultFile) throw new Error("smoke-verify requires --result.");
    }
  },
  "sign-verify": {
    ...artifactCommand("sign-verify accepts only --result, --format, and --json options."),
    allowed: ["resultFile", "format"],
    validate(options) {
      if (!options.help && !options.resultFile) throw new Error("sign-verify requires --result.");
    }
  },
  "release-verify": {
    ...artifactCommand("release-verify accepts only --smoke-result, --scan-result, --sign-result, --format, and --json options."),
    allowed: ["smokeResultFile", "scanResultFile", "signResultFile", "format"],
    validate(options) {
      if (!options.help && (!options.smokeResultFile || !options.scanResultFile || !options.signResultFile)) throw new Error("release-verify requires --smoke-result, --scan-result, and --sign-result.");
    }
  },
  "publish-plan": {
    ...artifactCommand("publish-plan accepts only --release-verification, --release-tag, --format, and --json options."),
    allowed: ["releaseVerificationFile", "releaseTag", "format"],
    validate(options) {
      if (!options.help && (!options.releaseVerificationFile || !options.releaseTag)) throw new Error("publish-plan requires --release-verification and --release-tag.");
    }
  },
  "publish-verify": {
    ...artifactCommand("publish-verify accepts only --result, --release-verification, --release-tag, --format, and --json options."),
    allowed: ["resultFile", "releaseVerificationFile", "releaseTag", "format"],
    validate(options) {
      if (!options.help && (!options.resultFile || !options.releaseVerificationFile || !options.releaseTag)) throw new Error("publish-verify requires --result, --release-verification, and --release-tag.");
    }
  }
};

const COMMANDS = new Set(Object.keys(COMMAND_SPECS));

// 解析可选的 GitHub API 超时环境变量；空值表示未设置，非法值立即报错
function readTimeoutMs(value) {
  if (value === undefined || value === "") return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error("INSTALLERMARKER_TIMEOUT_MS must be a positive integer of milliseconds.");
  return parsed;
}

// 解析可选的安装包下载超时环境变量；校验规则与 API 超时一致
function readDownloadTimeoutMs(value) {
  if (value === undefined || value === "") return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error("INSTALLERMARKER_DOWNLOAD_TIMEOUT_MS must be a positive integer of milliseconds.");
  return parsed;
}

function optionIsSet(options, field) {
  return typeof options[field] === "boolean" ? options[field] : options[field] !== undefined;
}

function assertAllowedOptions(command, options, spec) {
  const allowed = new Set(spec.allowed);
  for (const field of OPTION_FIELDS) {
    if (field === spec.inputTarget) continue;
    if (field !== "format" && !allowed.has(field) && optionIsSet(options, field)) {
      throw new Error(spec.accepts);
    }
  }
}

function assertFormat(command, options, spec) {
  if (!spec.formats.includes(options.format)) {
    if (spec.formats.length === 1 && spec.formats[0] === "text") throw new Error(spec.accepts);
    throw new Error(`${command} supports only ${spec.formats.join(" and ")} output.`);
  }
}

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
    token: command === "inspect" ? process.env.GITHUB_TOKEN : undefined,
    timeoutMs: command === "inspect" ? readTimeoutMs(process.env.INSTALLERMARKER_TIMEOUT_MS) : undefined,
    downloadTimeoutMs: command === "materialize" ? readDownloadTimeoutMs(process.env.INSTALLERMARKER_DOWNLOAD_TIMEOUT_MS) : undefined
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
    } else if (argument === "--command") {
      options.buildCommand = valueAfter(index, argument);
      index += 1;
    } else if (argument === "--artifact-dir") {
      options.artifactDirectory ??= [];
      options.artifactDirectory.push(valueAfter(index, argument));
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
    throw new Error(COMMAND_SPECS[command].missingInput ?? "A JSON or YAML recipe file is required.");
  }
  if (!["text", "json", "yaml"].includes(options.format)) throw new Error("--format must be text, json, or yaml.");

  const spec = COMMAND_SPECS[command];
  options[spec.inputTarget] = options.input;
  spec.validate?.(options);
  assertAllowedOptions(command, options, spec);
  assertFormat(command, options, spec);

  return options;
}

export function usage() {
  return `Usage:
  installermarker [inspect] <github-url> [options]
  installermarker materialize <recipe.(json|yaml)> --output-dir <directory>
  installermarker build <recipe.(json|yaml)> --target <platform> --workspace <directory> --output-dir <directory> --allow-unsafe-local-build
  installermarker package <project-directory> [--command <command>] [--target <platform>] [--artifact-dir <directory>] [--output-dir <directory>]
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
  INSTALLERMARKER_TIMEOUT_MS  Raise the GitHub API request timeout (default: 15000)

Materialize options:
  --output-dir <dir>   Directory for verified installers and artifacts.json
  --target <platform>  Materialize only windows-x64, macos-universal, or linux-x64
  --dry-run            Validate and print the download plan without writing
  --recipe-root <dir>  Require the recipe file to be inside this directory
  INSTALLERMARKER_DOWNLOAD_TIMEOUT_MS  Raise the installer download timeout (default: 600000)

Build options:
  --target <platform>  windows-x64, macos-universal, or linux-x64
  --workspace <dir>    New isolated checkout directory
  --output-dir <dir>   Directory for verified built installers
  --dry-run            Validate and print the source-build plan without executing
  --allow-unsafe-local-build
                      Explicitly permit reviewed source code execution in this environment
  --recipe-root <dir>  Require the recipe file to be inside this directory

Package options:
  --command <command>  Command that creates the distributable package
  --target <platform>  Defaults to the current host: windows-x64, macos-universal, or linux-x64
  --artifact-dir <dir> Directory to search for packages; may be repeated
  --output-dir <dir>   Directory for copied packages and package-manifest.json
  --dry-run            Detect the project and print the package plan without executing
  --force              Allow replacing existing files in the output directory

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
