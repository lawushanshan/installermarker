# 安全策略

[English](SECURITY.md)

## 威胁模型

提交给 InstallerMarker 的仓库均不可信。其源代码、README、构建配置、Release 资产和依赖都可能具有恶意。分析器必须保持只读，不得执行项目代码。

未来的构建 Worker 必须按任务使用临时隔离环境，不能访问开发者工作站或 CI 密钥，并且需要受限的网络访问策略。构建完成后，产物签名和 macOS 公证必须在独立且受保护的环境中完成。

当前落盘 Worker 不会执行或安装任何产物。它只接受源仓库公开 GitHub Releases 中已经固定摘要的资产，流式校验通过后才会提交文件，并拒绝覆盖已有输出。摘要一致只能证明下载内容与配方一致，不能证明安装包本身无恶意行为。

仓库内的 GitHub Actions 落盘工作流只拥有 `contents: read` 权限，不会保留检出凭据，并且只读取已经检出的控制仓库中的配方。因此必须保护配方变更和工作流手动触发权限。

Scorecard 工作流只使用只读仓库权限，以及发布 SARIF 结果和 Scorecard 结果所需的 `security-events` 与 OIDC 权限。它禁用检出凭据保留，也不会接收仓库密钥。

源码构建工作流会执行经过明确审核的仓库代码。它使用受保护 environment、临时托管 Runner、`contents: read`、禁用检出凭据保留、隔离 home，以及传给目标命令的精简环境。这并不能让任意未审核代码变得安全；绝不能向 `source-build` environment 配置签名证书、部署令牌或生产密钥。

## 漏洞报告

请勿通过公开 Issue 报告疑似漏洞，请使用 [GitHub 私密漏洞报告表单](https://github.com/lawushanshan/installermarker/security/advisories/new)。
