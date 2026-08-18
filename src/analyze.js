import { createGitHubClient, decodeContent, parseGitHubUrl } from "./github.js";
import { classifyTargets, detectProject } from "./detect.js";
import { assessDependencyRisks, extractDependencyInventory } from "./dependencies.js";

const INTERESTING_FILES = new Set([
  "package.json", "go.mod", "Cargo.toml", "pyproject.toml", "requirements.txt", "setup.py",
  "pom.xml", "build.gradle", "build.gradle.kts", "Dockerfile", "compose.yaml", "docker-compose.yml",
  "src-tauri/tauri.conf.json", "src-tauri/tauri.conf.json5"
]);

export async function analyzeRepository(url, { fetch, token, timeoutMs } = {}) {
  const { owner, repository } = parseGitHubUrl(url);
  const github = createGitHubClient(fetch, token, { timeoutMs });
  const metadata = await github.repository(owner, repository);
  const [commit, release] = await Promise.all([
    github.commit(owner, repository, metadata.default_branch),
    github.latestRelease(owner, repository)
  ]);
  const treeSha = commit.commit?.tree?.sha;
  if (!commit.sha || !treeSha) throw new Error("GitHub did not return an immutable commit and tree SHA.");
  const tree = await github.tree(owner, repository, treeSha);
  if (tree.truncated) throw new Error("Repository tree is too large for safe automatic inspection. Add an explicit recipe manually.");

  const blobPaths = tree.tree.filter((item) => item.type === "blob").map((item) => item.path);
  const paths = blobPaths.filter((path) => INTERESTING_FILES.has(path));
  const files = await Promise.all(paths.map(async (path) => {
    const content = await github.content(owner, repository, path, commit.sha);
    return { path, content: decodeContent(content) };
  }));
  const project = detectProject(files);
  const dependencies = extractDependencyInventory(files, { paths: blobPaths });
  const dependencyRisks = assessDependencyRisks(dependencies);
  const assets = (release?.assets ?? []).map((asset) => ({
    name: asset.name,
    url: asset.browser_download_url,
    size: asset.size,
    digest: asset.digest ?? null
  }));
  const targets = classifyTargets(assets, project);
  const availableTargets = targets.filter((target) => target.status === "available").length;

  return {
    schemaVersion: 1,
    source: {
      url: `https://github.com/${owner}/${repository}`,
      owner,
      repository,
      defaultBranch: metadata.default_branch,
      commitSha: commit.sha,
      treeSha,
      committedAt: commit.commit?.committer?.date ?? null,
      license: metadata.license?.spdx_id ?? "NOASSERTION"
    },
    application: {
      name: metadata.name,
      description: metadata.description ?? "",
      homepage: metadata.homepage ?? ""
    },
    analysis: {
      project,
      inspectedFiles: files.map((file) => file.path),
      dependencies,
      dependencyRisks,
      latestRelease: release ? { tag: release.tag_name, publishedAt: release.published_at, url: release.html_url } : null,
      confidence: availableTargets === 3 ? "high" : project.kind === "unknown" ? "low" : "medium",
      safety: "Static metadata inspection only. No repository code has been cloned or executed."
    },
    targets
  };
}