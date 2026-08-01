# 从源码构建本地安装包

[English](source-build.md)

InstallerMarker 可以将经过审核的 Electron 和 Tauri 项目构建为原生本地安装包。对于 Go、Rust 和 Python，它也会生成 `build-native` 路径：审核人必须选择原生打包器和对应的安装包产物目录。这条路径与 `materialize` 刻意分离：它会执行源代码和依赖，因此只能在临时、无密钥环境中运行。

## 准备配方

先分析仓库并生成 JSON 或 YAML 配方。对于 Electron 和 Tauri，InstallerMarker 会给出源码构建目标、默认产物目录以及常见的建议命令。Go、Rust 和 Python 会生成 `build-native`，需要补充已审核的命令和所选原生打包工具的安装包产物目录。执行前必须审核并编辑配方：

```json
{
  "build": {
    "strategy": "electron",
    "command": "npm ci && npm run dist",
    "artifactDirectories": ["dist", "out"]
  },
  "targets": [
    { "platform": "windows-x64", "status": "likely", "packaging": "build-electron" }
  ]
}
```

执行 `installermarker validate recipe.json`，其中的源码构建状态必须为 `ready`。构建命令是安全边界，必须先针对该仓库和固定 commit 审核，不能直接把建议命令当作授权命令。

使用 `build-native` 时，将 `build.strategy` 设为 `go-native`、`rust-native` 或 `python-native`，保留 `packaging: build-native`，并配置能在 `artifactDirectories` 中生成平台安装包的命令。Python 默认产物目录为 `dist` 和 `build`，但不会猜测入口或打包命令；审核人必须针对固定 commit 选择并审核 PyInstaller、Briefcase 或 Nuitka 等工具。Worker 刻意不替审核人选择打包器：Windows、macOS 和 Linux 的打包与签名要求不同。

## 本地执行

每个目标只能在对应操作系统上运行。确认参数是必填项，因为命令会执行目标仓库代码。

```bash
installermarker build recipe.json \
  --target linux-x64 \
  --workspace /safe-temporary-directory/source \
  --output-dir artifacts/linux \
  --allow-unsafe-local-build
```

工作目录必须不存在。InstallerMarker 会在审核过的 commit 克隆公开 GitHub 源码，在克隆前禁用系统 Git 配置和 hooks，使用隔离的 home 和 npm 配置执行审核过的命令，只收集该平台对应的安装包、计算摘要并写入 `build-artifacts.json`。产物目录必须是检出目录内的真实目录，不能是符号链接；每个安装包最大为 1 GiB。它不会覆盖已有产物。检出目录会保留以便检查构建日志，确认结果后再删除。

## GitHub Actions

在 InstallerMarker 控制仓库中使用 `.github/workflows/build.yml`。它会在原生 Windows、macOS 或 Linux 托管 Runner 上执行指定目标，并将验证后的安装包上传为工作流 Artifact。使用前请创建带必需审核人的受保护 `source-build` environment。工作流只检出控制仓库，Worker 随后在不保留凭据的情况下按 commit 克隆目标源码。

Worker 识别 Windows `.msi`/`.exe`、macOS `.dmg`/`.pkg` 和 Linux `.AppImage`/`.deb`/`.rpm`。它不负责签名或公证；签名必须放在后续独立审批阶段。
