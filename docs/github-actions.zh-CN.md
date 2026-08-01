# GitHub Actions 安装包落盘 Worker

[English](github-actions.md)

InstallerMarker 在 `.github/workflows/materialize.yml` 中提供了手动触发的工作流。将已审核的 JSON 或 YAML 配方保存在 InstallerMarker 控制仓库中，然后打开 **Actions**，选择 **Materialize Verified Installers**，并填写已经提交的配方路径。

工作流会：

1. 检出控制仓库，并在检出后禁用凭据保留。
2. 校验配方契约。
3. 只下载源仓库 GitHub Releases 中已固定摘要的安装包。
4. 将验证后的文件和 `artifacts.json` 作为短期 GitHub Actions Artifact 上传。

它只拥有 `contents: read` 权限，不使用仓库密钥，不检出目标仓库，也不会执行或安装下载文件。工作流会传入 `--recipe-root "$GITHUB_WORKSPACE"`，因此手动触发时不能通过输入路径或符号链接读取控制仓库以外的配方。即使源代码构建字段还没有完成，工作流仍可物化已有安装包；源码构建被刻意排除在该工作流之外。

启用前请保护默认分支，并限制可以手动触发工作流的成员。所有配方变更都应按代码审查，因为配方会在经过 GitHub Release 来源校验的范围内选择外部下载地址。