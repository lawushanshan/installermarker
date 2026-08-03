import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { access, copyFile, lstat, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { basename, join, relative, resolve, sep } from "node:path";
import { detectProject } from "./detect.js";
import { runProcess } from "./build.js";

const HOST_TARGETS = { win32: "windows-x64", darwin: "macos-universal", linux: "linux-x64" };
const PACKAGE_EXTENSIONS = {
  "windows-x64": /\.(?:msi|exe|zip)$/i,
  "macos-universal": /\.(?:dmg|pkg|zip)$/i,
  "linux-x64": /\.(?:appimage|deb|rpm|tar\.gz|tgz|zip)$/i
};

async function readFileIfPresent(directory, name) {
  try {
    const path = join(directory, name);
    const metadata = await lstat(path);
    if (!metadata.isFile()) return null;
    return { path: name, content: await readFile(path, "utf8") };
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

async function projectFiles(directory) {
  const names = [
    "package.json",
    "pyproject.toml",
    "requirements.txt",
    "setup.py",
    "go.mod",
    "Cargo.toml",
    "Dockerfile",
    "compose.yaml",
    "docker-compose.yml",
    "src-tauri/tauri.conf.json",
    "src-tauri/tauri.conf.json5"
  ];
  return (await Promise.all(names.map((name) => readFileIfPresent(directory, name)))).filter(Boolean);
}

function packageScriptCommand(content) {
  try {
    const scripts = JSON.parse(content).scripts ?? {};
    return scripts.dist
      ? "npm ci && npm run dist"
      : scripts.make
        ? "npm ci && npm run make"
        : scripts.package
          ? "npm ci && npm run package"
          : scripts.build
            ? "npm ci && npm run build"
            : null;
  } catch {
    return null;
  }
}

export async function inspectLocalProject(projectDirectory) {
  const directory = resolve(projectDirectory);
  const metadata = await stat(directory);
  if (!metadata.isDirectory()) throw new Error(`Project path is not a directory: ${directory}`);
  const files = await projectFiles(directory);
  if (!files.length) throw new Error(`No supported project manifest found in: ${directory}`);
  const project = detectProject(files);
  const packageJson = files.find((file) => file.path === "package.json");
  const suggestedBuildCommand = project.suggestedBuildCommand ?? (packageJson ? packageScriptCommand(packageJson.content) : null);
  const artifactDirectories = project.artifactDirectories?.length
    ? project.artifactDirectories
    : project.kind === "electron"
      ? ["dist", "out"]
      : ["dist", "build"];
  return { directory, project, suggestedBuildCommand, artifactDirectories };
}

async function walkFiles(root, files) {
  let metadata;
  try {
    metadata = await lstat(root);
  } catch (error) {
    if (error.code === "ENOENT") return;
    throw error;
  }
  if (metadata.isSymbolicLink()) throw new Error(`Artifact directory must not be a symbolic link: ${root}`);
  if (!metadata.isDirectory()) return;
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) await walkFiles(path, files);
    else if (entry.isFile()) files.push(path);
  }
}

export async function collectPackageArtifacts(projectDirectory, artifactDirectories, targetPlatform, { excludedDirectory } = {}) {
  const files = [];
  for (const directory of artifactDirectories) await walkFiles(join(projectDirectory, directory), files);
  const extension = PACKAGE_EXTENSIONS[targetPlatform];
  const excluded = excludedDirectory ? `${resolve(excludedDirectory)}${sep}` : null;
  const artifacts = files.filter((path) => !excluded || !resolve(path).startsWith(excluded)).filter((path) => extension.test(path));
  if (!artifacts.length) throw new Error(`No ${targetPlatform} package was found in: ${artifactDirectories.join(", ")}. Pass --artifact-dir to select another directory.`);
  return artifacts.sort((left, right) => relative(projectDirectory, left).localeCompare(relative(projectDirectory, right)));
}

async function hashFile(path) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}

async function publishPackageArtifacts(artifacts, outputDirectory, plan, force) {
  const output = resolve(outputDirectory);
  await mkdir(output, { recursive: true });
  const manifestPath = join(output, "package-manifest.json");
  const manifest = {
    schemaVersion: 1,
    source: { path: plan.projectDirectory },
    project: { kind: plan.project.kind, strategy: plan.project.strategy },
    build: { command: plan.command, target: plan.targetPlatform, artifactDirectories: plan.artifactDirectories },
    artifacts: []
  };
  const names = new Set();
  for (const sourcePath of artifacts) {
    const name = basename(sourcePath);
    if (names.has(name)) throw new Error(`Build produced duplicate package filenames: ${name}`);
    names.add(name);
    if (!force) {
      try {
        await access(join(output, name));
        throw new Error(`Refusing to overwrite existing output: ${join(output, name)}`);
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
    }
  }
  if (!force) {
    try {
      await access(manifestPath);
      throw new Error(`Refusing to overwrite existing output: ${manifestPath}`);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  for (const sourcePath of artifacts) {
    const name = basename(sourcePath);
    const destination = join(output, name);
    await copyFile(sourcePath, destination);
    const metadata = await stat(destination);
    manifest.artifacts.push({
      target: plan.targetPlatform,
      name,
      size: metadata.size,
      sha256: await hashFile(destination),
      sourcePath: relative(plan.projectDirectory, sourcePath)
    });
  }
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { flag: force ? "w" : "wx" });
  return manifest;
}

export async function packageProject(projectDirectory, {
  command,
  targetPlatform = HOST_TARGETS[process.platform],
  outputDir,
  artifactDirectories,
  dryRun = false,
  force = false,
  run = runProcess
} = {}) {
  if (!targetPlatform || !PACKAGE_EXTENSIONS[targetPlatform]) throw new Error("Target must be windows-x64, macos-universal, or linux-x64.");
  if (HOST_TARGETS[process.platform] !== targetPlatform) throw new Error(`${targetPlatform} packages must be built on its matching host operating system.`);
  const inspected = await inspectLocalProject(projectDirectory);
  const buildCommand = command ?? inspected.suggestedBuildCommand;
  if (!buildCommand) throw new Error("No build command was detected. Pass --command with the project's packaging command.");
  const directories = artifactDirectories?.length ? artifactDirectories : inspected.artifactDirectories;
  const output = resolve(outputDir ?? join(inspected.directory, ".installermarker-output"));
  const plan = {
    projectDirectory: inspected.directory,
    project: inspected.project,
    command: buildCommand,
    targetPlatform,
    artifactDirectories: directories,
    outputDir: output
  };
  if (dryRun) return plan;
  await run(buildCommand, [], { cwd: inspected.directory, shell: true });
  const artifacts = await collectPackageArtifacts(inspected.directory, directories, targetPlatform, { excludedDirectory: output });
  return publishPackageArtifacts(artifacts, output, plan, force);
}

export { HOST_TARGETS };
