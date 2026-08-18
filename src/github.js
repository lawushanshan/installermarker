const GITHUB_URL = /^(?:https:\/\/github\.com\/|git@github\.com:)([^/\s]+)\/([^/#\s]+?)(?:\.git)?\/?(?:#.*)?$/i;

export function parseGitHubUrl(url) {
  const match = String(url).trim().match(GITHUB_URL);
  if (!match) throw new Error("Use a GitHub repository URL such as https://github.com/owner/repository.");
  return { owner: match[1], repository: match[2] };
}

export function createGitHubClient(fetchImplementation, token, { timeoutMs = 15_000 } = {}) {
  if (typeof fetchImplementation !== "function") throw new Error("A fetch implementation is required.");
  const headers = {
    Accept: "application/vnd.github+json",
    "User-Agent": "installermarker"
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  // 将中止/超时形态的错误（含包装在 cause 链中的）统一转换为可操作的提示信息
  function timeoutError(error, path) {
    let current = error;
    while (current) {
      if (current.name === "TimeoutError" || current.name === "AbortError") {
        return new Error(`GitHub API request timed out for ${path} after ${timeoutMs}ms. Raise INSTALLERMARKER_TIMEOUT_MS on slow networks.`);
      }
      current = current.cause;
    }
    return error;
  }

  async function request(path, optional = false) {
    let response;
    try {
      response = await fetchImplementation(`https://api.github.com${path}`, {
        headers,
        signal: AbortSignal.timeout(timeoutMs)
      });
    } catch (error) {
      throw timeoutError(error, path);
    }
    if (optional && response.status === 404) return null;
    if (!response.ok) {
      // 响应头已到达但 body 读取仍可能因超时中止，因此同样纳入超时包装
      let body = "";
      try {
        body = await response.text();
      } catch (error) {
        throw timeoutError(error, path);
      }
      throw new Error(`GitHub API ${response.status} for ${path}${body ? `: ${body.slice(0, 160)}` : ""}`);
    }
    return response.json().catch((error) => {
      throw timeoutError(error, path);
    });
  }

  return {
    repository: (owner, repository) => request(`/repos/${owner}/${repository}`),
    commit: (owner, repository, ref) => request(`/repos/${owner}/${repository}/commits/${encodeURIComponent(ref)}`),
    tree: (owner, repository, ref) => request(`/repos/${owner}/${repository}/git/trees/${encodeURIComponent(ref)}?recursive=1`),
    content: (owner, repository, path, ref) => request(`/repos/${owner}/${repository}/contents/${path}?ref=${encodeURIComponent(ref)}`, true),
    latestRelease: (owner, repository) => request(`/repos/${owner}/${repository}/releases/latest`, true)
  };
}

export function decodeContent(content, maxBytes = 256 * 1024) {
  if (!content?.content || content.encoding !== "base64") return "";
  if (content.size > maxBytes) throw new Error(`Manifest exceeds the ${maxBytes}-byte inspection limit.`);
  return Buffer.from(content.content.replace(/\n/g, ""), "base64").toString("utf8");
}
