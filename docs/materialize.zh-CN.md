# 已有安装包落盘说明

[English](materialize.md)

`materialize` 是第一个受限 Worker。它下载仓库已经发布的安装包，验证文件并生成来源清单。它不会执行、安装、重新打包或签名任何文件。

先生成 JSON 或 YAML 配方，审核源代码 commit 和目标平台，再预览下载计划：

```bash
installermarker inspect https://github.com/owner/repository \
  --recipe --format json --output installermarker.json
installermarker validate installermarker.json
installermarker materialize installermarker.json --dry-run
```

确认后，将安装包写入一个全新或不存在同名文件的目录：

```bash
installermarker materialize installermarker.json --output-dir artifacts/v1
installermarker materialize installermarker.json --target linux-x64 --output-dir artifacts/linux
```

Worker 只处理打包策略为 `reuse-installer` 的目标，其他目标会记录为跳过。传入 `--target windows-x64`、`--target macos-universal` 或 `--target linux-x64` 可只落盘一个可复用安装包；省略该参数则处理全部可复用目标。每个选中资产必须具有 GitHub 发布的 SHA-256，大小不超过 1 GiB，扩展名符合目标平台，并且来自源仓库的公开 GitHub Releases。对于瞬时连接失败、限流和服务端错误，Worker 最多会重试两次；成功响应仍会执行相同的来源、大小与 SHA-256 校验。当前尚不支持需要身份认证的私有 Release 资产。

`validate` 是审核门禁：它不会下载文件，而是校验公开 JSON Schema 和落盘策略。CLI 支持 `.json`、`.yaml` 和 `.yml` 配方文件。`validate --strict` 会把尚未解决的审核警告也视为失败，适合要求完全确认配方后才允许自动化的仓库。

输出目录包含验证后的安装包和 `artifacts.json`。已有文件不会被覆盖。清单会记录源仓库、commit 和可用的 SPDX 许可证证据，以及目标平台、文件名、验证后的字节数与 SHA-256 和原始 GitHub URL。格式约定位于 `schema/artifact-manifest.schema.json`。
