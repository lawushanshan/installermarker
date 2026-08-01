# 发布指南

[English](releasing.md)

1. 确认 `main` 分支 CI 全部通过，并审核自动生成的 Release Notes。
2. 按照语义化版本更新 `package.json` 并提交。
3. 创建与包版本完全一致的带注释标签，例如 `v0.2.0`。
4. 推送提交和标签；受保护的 `release` environment 必须批准该工作流。
5. 确认 GitHub Release 已包含 `.tgz` 产物；如果启用了 npm 发布，还应确认 npm 包元数据。

发布工作流会拒绝与 `package.json` 不一致的标签。GitHub Release 只需作用域受限的 `GITHUB_TOKEN`；未配置 `NPM_TOKEN` 仓库密钥时，npm 发布会自动跳过。发布 npm 包时，工作流会通过 `id-token: write` 生成 npm provenance，供使用者验证包的构建来源。