# InstallerMarker

[English](README.md)

InstallerMarker 是一个安全的第一阶段分析工具，用于将开源 GitHub 仓库转化为跨平台安装包方案。它不承诺每个仓库都能自动变成 Windows、macOS 和 Linux 应用，而是让打包决策有明确依据、可复现且可审核。

## 0.2 版本能力

- 接受公开 GitHub 仓库链接。
- 读取仓库元数据、Release 资产，以及少量标准构建清单。
- 只解析一次默认分支，并将分析和配方固定到不可变的 commit SHA。
- 识别 Electron、Tauri、Go、Rust、Python、Java、Node.js 和容器服务等常见项目类型。
- 分别评估 Windows x64、macOS 和 Linux x64，给出 `available`、`likely` 或 `needs_review` 状态。
- 生成可编辑的安装配方草案，供之后的隔离构建流程使用。
- 在不执行安装包的前提下，将已有 GitHub Release 安装包下载并校验到产物目录。

它不会克隆目标仓库、安装其依赖或执行其代码。提交给安装器工厂的仓库链接必须始终作为不可信输入处理。

## 快速开始

需要 Node.js 20 或更高版本。

通过当前 GitHub Release 安装：

```bash
npm install --global https://github.com/lawushanshan/installermarker/releases/download/v0.2.1/installermarker-0.2.1.tgz
```

可使用 `installermarker --version` 查看当前安装的 CLI 版本。启用 npm 发布后，也可以使用 `npx installermarker` 运行相同命令。

```bash
installermarker https://github.com/owner/repository
installermarker https://github.com/owner/repository --recipe --format yaml
installermarker https://github.com/owner/repository --recipe --format json --output installermarker.json
installermarker validate installermarker.json
installermarker materialize installermarker.json --dry-run
installermarker materialize installermarker.json --output-dir artifacts/v1
installermarker materialize installermarker.json --target linux-x64 --output-dir artifacts/linux
installermarker verify artifacts/v1
```

访问私有仓库，或希望获得更高 GitHub API 限额时，可以提供只读仓库权限的令牌：

```bash
GITHUB_TOKEN=github_pat_xxx installermarker https://github.com/owner/repository --recipe
```

令牌只用于本次执行中的 GitHub API 请求，不会写入磁盘。

## 结果说明

`available` 表示最新 GitHub Release 中存在目标平台的交付资产。生成的配方会区分可直接复用的安装包（`.msi`、`.dmg`、`.pkg`、`.AppImage`、`.deb`、`.rpm`）和仍需封装为安装包的压缩归档。

`likely` 表示检测到惯例上支持跨平台原生构建的项目类型，但仍需要在隔离环境中构建和冒烟测试。`needs_review` 表示现有证据不足，需要人工决定打包方案；它不是失败结果。

生成的配方会故意保留可执行入口和构建命令的 `TODO`。在允许任何构建 Worker 执行前，必须人工确认这些字段。

配方支持 JSON 和 YAML；请使用对应的 `.json`、`.yaml` 或 `.yml` 文件扩展名，使 CLI 能确定解析格式。

配方会记录源代码 commit，以及 Release 资产的下载地址、大小和可用摘要。输出文件默认禁止覆盖；只有明确需要替换已有文件时才应使用 `--force`。JSON 格式约定见 [`schema/installermarker.schema.json`](schema/installermarker.schema.json)。

配方还会记录 GitHub 返回的 SPDX 许可证证据。`NOASSERTION` 只是审核警告，不代表允许再分发；发布重新打包的应用前必须确认许可证。

落盘前请运行 `validate`。它会将 Schema 错误和仍待人工确认的警告分开报告。`validate --strict` 遇到错误或警告都会返回非零状态，适合在 CI 中作为门禁使用。

当前 `materialize` 只接受公开安装包：URL 必须属于源仓库的 GitHub Releases，并且配方中必须存在 SHA-256。它会把选中的资产流式下载到临时目录，校验声明大小和摘要后，再连同 `artifacts.json` 来源清单一起提交到产物目录。使用 `--target` 可只选择一个平台；省略该参数则落盘配方中全部可复用安装包。它不会打开或安装这些文件，也绝不会覆盖已有产物。

使用 `verify <产物目录>` 可离线重新检查已有的 `artifacts.json` 或 `build-artifacts.json` 目录。它会验证清单格式、文件名、字节大小和 SHA-256，不会执行任何安装包。

对于尚未发布安装包的 Electron 和 Tauri 项目，请审核生成的源码构建配方、填写经过审核的 `build.command`，然后分别在原生目标系统上构建。Go 和 Rust 项目会生成 `build-native` 目标：需先选择并审核原生打包命令与产物目录。Worker 只接受 Windows `.msi/.exe`、macOS `.dmg/.pkg` 和 Linux `.AppImage/.deb/.rpm` 包，详见[源码构建说明](docs/source-build.zh-CN.md)。

## 项目发布与维护

Pull Request 会在 Node.js 20 和 22 上执行语法检查、单元测试与 npm 包内容检查。推送 `v0.2.0` 这样的标签后，发布工作流会生成 npm tarball 并附加到 GitHub Release。只有在仓库配置了 `NPM_TOKEN` 后才会发布 npm 包。

首次发布前，请创建 GitHub 仓库，将其添加为 `origin` 远端并推送 `main`：

```bash
git remote add origin https://github.com/<organization>/installermarker.git
git push -u origin main
```

已发布包的 `repository`、`bugs` 和 `homepage` 元数据指向本 GitHub 仓库；若仓库发生迁移，请同步更新这些字段。

建议为 `main` 开启分支保护：要求 CI 通过、要求 Pull Request 审核、禁止强制推送。GitHub Actions 应保持最小权限，并为发布凭据设置受保护的 environment。

## 范围与路线图

0.2 版本包含静态分析、固定 commit 的配方生成、已有安装包的校验落盘，以及经过审核的 Electron/Tauri、Go、Rust 源码构建路径。下一阶段将为 Go/Rust 增加约定式打包适配器，并覆盖 Python 等项目类型，同时加入 SBOM、恶意软件与依赖扫描、安装/卸载冒烟测试，以及与不可信构建环境隔离的签名服务。

Windows Authenticode 证书，以及 macOS Developer ID 和公证凭据，绝不能暴露给仓库的构建脚本。

更多信息请参阅：[贡献指南（中文）](CONTRIBUTING.zh-CN.md)、[安全策略（中文）](SECURITY.zh-CN.md)、[架构说明（中文）](docs/architecture.zh-CN.md)、[安装包落盘说明（中文）](docs/materialize.zh-CN.md)、[本地产物验证说明（中文）](docs/verify.zh-CN.md) 和 [发布指南（中文）](docs/releasing.zh-CN.md)。

版本变更见 [CHANGELOG.md](CHANGELOG.md)。

需要在仓库中无密钥执行落盘任务时，请参阅 [GitHub Actions Worker 说明](docs/github-actions.zh-CN.md)。

需要在受保护环境中完成 Windows、macOS、Linux 原生源码构建时，请参阅 [源码构建说明](docs/source-build.zh-CN.md)。
