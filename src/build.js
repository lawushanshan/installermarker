import { createHash, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { constants, createReadStream } from "node:fs";
import { access, copyFile, link, lstat, mkdir, readdir, rm, stat, writeFile } from "node:fs/promises";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { createBuildPlan } from "./validate.js";

const HOST_TARGETS = { win32: "windows-x64", darwin: "macos-universal", linux: "linux-x64" };
const INSTALLER_EXTENSIONS = {
  "windows-x64": /\.(msi|exe)$/i,
  "macos-universal": /\.(dmg|pkg)$/i,
  "linux-x64": /\.(appimage|deb|rpm)$/i
};
const DEFAULT_MAX_ARTIFACT_BYTES = 1024 * 1024 * 1024;

function processError(label, code, signal) {
  return new Error(`${label} failed${code === null ? "" : ` with exit code ${code}`}${signal ? ` (${signal})` : ""}.`);
}

export async function runProcess(command, args, { cwd, env, shell = false, timeoutMs = 20 * 60_000, capture = false } = {}) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, { cwd, env, shell, stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit", windowsHide: true });
    let stdout = "";
    let stderr = "";
    if (capture) {
      child.stdout.on("data", (chunk) => { stdout += chunk; });
      child.stderr.on("data", (chunk) => { stderr += chunk; });
    }
    const timeout = setTimeout(() => {
      child.kill();
      rejectPromise(new Error(`${command} exceeded the ${timeoutMs}-ms timeout.`));
    }, timeoutMs);
    child.on("error", (error) => {
      clearTimeout(timeout);
      rejectPromise(new Error(`Could not start ${command}: ${error.message}`));
    });
    child.on("close", (code, signal) => {
      clearTimeout(timeout);
      if (code === 0) resolvePromise({ stdout, stderr });
      else rejectPromise(processError(command, code, signal));
    });
  });
}

function safeBuildEnvironment(home) {
  const keep = ["PATH", "SystemRoot", "ComSpec", "PATHEXT", "WINDIR", "TEMP", "TMP", "TMPDIR", "ProgramFiles", "ProgramFiles(x86)", "LOCALAPPDATA", "APPDATA", "LANG", "LC_ALL"];
  const environment = { CI: "true", GIT_CONFIG_NOSYSTEM: "1", GIT_TERMINAL_PROMPT: "0", HOME: home, USERPROFILE: home, npm_config_userconfig: join(home, ".npmrc"), npm_config_cache: join(home, ".npm-cache") };
  for (const key of keep) {
    if (process.env[key]) environment[key] = process.env[key];
  }
  return environment;
}

async function pathExists(path) {
  try {
    await access(path);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

function resolveInside(root, path) {
  const resolved = resolve(root, path);
  if (resolved !== root && !resolved.startsWith(`${root}${sep}`)) throw new Error(`Artifact directory escapes the source workspace: ${path}`);
  return resolved;
}

async function walkFiles(root, files, limit = 10_000) {
  let rootStat;
  try {
    rootStat = await lstat(root);
  } catch (error) {
    if (error.code === "ENOENT") return;
    throw error;
  }
  if (rootStat.isSymbolicLink()) throw new Error(`Artifact directory must not be a symbolic link: ${root}`);
  if (!rootStat.isDirectory()) return;
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) await walkFiles(path, files, limit);
    else if (entry.isFile()) {
      files.push(path);
      if (files.length > limit) throw new Error(`Build produced more than ${limit} files in configured artifact directories.`);
    }
  }
}

export async function collectInstallers(workspace, artifactDirectories, targetPlatform, { maxBytes = DEFAULT_MAX_ARTIFACT_BYTES } = {}) {
  const files = [];
  for (const directory of artifactDirectories) await walkFiles(resolveInside(workspace, directory), files);
  const extension = INSTALLER_EXTENSIONS[targetPlatform];
  const installers = files.filter((file) => extension.test(file));
  if (!installers.length) throw new Error(`No ${targetPlatform} installer was found in: ${artifactDirectories.join(", ")}.`);
  for (const installer of installers) {
    if ((await stat(installer)).size > maxBytes) throw new Error(`Build artifact exceeds the ${maxBytes}-byte limit: ${basename(installer)}.`);
  }
  const names = new Set();
  for (const installer of installers) {
    const name = basename(installer);
    if (names.has(name)) throw new Error(`Build produced duplicate installer filenames: ${name}.`);
    names.add(name);
  }
  return installers.sort((left, right) => relative(workspace, left).localeCompare(relative(workspace, right)));
}

async function hashFile(path) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}

async function publishBuildArtifacts(installerPaths, outputDir, plan) {
  const destination = resolve(outputDir);
  await mkdir(destination, { recursive: true });
  const manifestPath = join(destination, "build-artifacts.json");
  const names = installerPaths.map((path) => basename(path));
  for (const path of [manifestPath, ...names.map((name) => join(destination, name))]) {
    if (await pathExists(path)) throw new Error(`Refusing to overwrite existing output: ${path}`);
  }

  const staging = join(destination, `.installermarker-build-${randomUUID()}`);
  await mkdir(staging);
  const created = [];
  try {
    const artifacts = [];
    for (const sourcePath of installerPaths) {
      const name = basename(sourcePath);
      const stagedPath = join(staging, name);
      await copyFile(sourcePath, stagedPath, constants.COPYFILE_EXCL);
      const metadata = await stat(stagedPath);
      artifacts.push({ platform: plan.target.platform, name, size: metadata.size, sha256: await hashFile(stagedPath), sourcePath: relative(resolve(plan.workspace), sourcePath) });
    }
    for (const artifact of artifacts) {
      const finalPath = join(destination, artifact.name);
      await link(join(staging, artifact.name), finalPath);
      created.push(finalPath);
    }
    const manifest = {
      schemaVersion: 1,
      source: plan.source,
      build: { strategy: plan.target.strategy, command: plan.target.command, platform: plan.target.platform },
      artifacts
    };
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { flag: "wx" });
    created.push(manifestPath);
    return manifest;
  } catch (error) {
    await Promise.all(created.map((path) => rm(path, { force: true })));
    throw error;
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}

export async function buildRecipe(recipe, { targetPlatform, workspace, outputDir, allowUnsafeLocalBuild = false, maxArtifactBytes = DEFAULT_MAX_ARTIFACT_BYTES, processPlatform = process.platform, run = runProcess } = {}) {
  if (!allowUnsafeLocalBuild) throw new Error("Source builds can execute untrusted code. Pass --allow-unsafe-local-build only in an isolated environment.");
  if (!targetPlatform || !workspace || !outputDir) throw new Error("Source builds require --target, --workspace, and --output-dir.");
  if (HOST_TARGETS[processPlatform] !== targetPlatform) throw new Error(`${targetPlatform} builds must run on its matching host operating system.`);
  const target = createBuildPlan(recipe, targetPlatform);
  const checkout = resolve(workspace);
  if (await pathExists(checkout)) throw new Error(`Refusing to reuse an existing build workspace: ${checkout}`);
  await mkdir(dirname(checkout), { recursive: true });
  const home = join(dirname(checkout), `.installermarker-home-${randomUUID()}`);
  await mkdir(home);
  const hooks = join(home, "hooks");
  await mkdir(hooks);
  const environment = safeBuildEnvironment(home);

  try {
    await run("git", ["-c", `core.hooksPath=${hooks}`, "clone", "--no-checkout", target.source.repository, checkout], { env: environment });
    await run("git", ["-C", checkout, "config", "core.hooksPath", hooks], { env: environment });
    await run("git", ["-C", checkout, "checkout", "--detach", target.source.commit], { env: environment });
    const revision = (await run("git", ["-C", checkout, "rev-parse", "HEAD"], { env: environment, capture: true })).stdout.trim();
    if (revision.toLowerCase() !== target.source.commit.toLowerCase()) throw new Error("Checked-out source revision does not match the reviewed recipe commit.");

    await run(target.target.command, [], { cwd: checkout, env: environment, shell: true });
    const installers = await collectInstallers(checkout, target.target.artifactDirectories, target.target.platform, { maxBytes: maxArtifactBytes });
    return await publishBuildArtifacts(installers, outputDir, { ...target, workspace: checkout });
  } finally {
    await rm(home, { recursive: true, force: true });
  }
}