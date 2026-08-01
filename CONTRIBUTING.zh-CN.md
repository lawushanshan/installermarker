# 贡献指南

[English](CONTRIBUTING.md)

## 开发环境

使用 Node.js 20 或更高版本。

```bash
npm test
npm run check
npm run pack:dry-run
```

检测逻辑必须是确定性的。每个分析结果都应说明产生该结论的具体仓库证据，并严格区分事实和建议。不得加入会执行被分析仓库源代码的行为。

修改配方格式时，必须同步更新 `schema/installermarker.schema.json` 并增加兼容性测试。已有 schema 版本必须保持可读，或者提供明确的迁移路径。

## Pull Request

请保持改动聚焦；新增检测能力时必须提供测试；支持的项目类型或目标平台策略发生变化时必须同步更新文档。维护者应在 CI 通过后合并，推荐使用 squash merge，并采用 Conventional Commit 格式的提交标题。

## 发布

使用语义化版本号，并创建带注释的版本标签。发布工作流会将打包好的 CLI 产物附加到 GitHub Release。只有配置 `NPM_TOKEN` 且获得明确发布批准时，才会发布 npm 包。
