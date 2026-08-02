# 发布指南

[English](releasing.md)

1. 确认 `main` 分支 CI 全部通过，并审核自动生成的 Release Notes。
2. 按照语义化版本更新 `package.json` 并提交。
3. 创建与包版本完全一致的带注释标签，例如 `v0.2.0`。
4. 推送提交和标签；受保护的 `release` environment 必须批准该工作流。
5. 确认 GitHub Release 已包含 `.tgz` 产物；如果启用了 npm 发布，还应确认 npm 包元数据。

发布工作流会拒绝与 `package.json` 不一致的标签。GitHub Release 只需作用域受限的 `GITHUB_TOKEN`；未配置 `NPM_TOKEN` 仓库密钥时，npm 发布会自动跳过。发布 npm 包时，工作流会通过 `id-token: write` 生成 npm provenance，供使用者验证包的构建来源。

## 安装包产物发布计划

对于重新打包的安装包产物，不要直接从构建、冒烟测试、扫描或签名 Worker 发布。`release-verify` 生成有效的 `release-verification.json` 后，再运行：

```bash
installermarker publish-plan artifacts/linux --release-verification release-verification.json --release-tag v1.0.0 --format json > publish-plan.json
```

该计划会校验最终证据属于当前已验证产物目录，并列出精确的安装包资产、必需 SHA-256、补充证据文件和人工发布检查项。它仍然只是计划：不会上传文件、创建 GitHub Release、发布包、签名产物、执行公证或访问外部服务。

如果需要在仓库中运行，`.github/workflows/publish-plan.yml` 会从两组 GitHub Actions artifact 生成同样的计划：已验证产物目录和 `release-verification.json`。它只使用 `actions: read` 和 `contents: read` 权限，将 `publish-plan.json` 作为短期 artifact 上传，并且仍然不会创建 Release 或发布包。
