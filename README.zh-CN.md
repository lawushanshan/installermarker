# InstallerMarker

[English](README.md)

InstallerMarker 是一个安全的第一阶段分析工具，用于将开源 GitHub 仓库转化为跨平台安装包方案。它不承诺每个仓库都能自动变成 Windows、macOS 和 Linux 应用，而是让打包决策有明确依据、可复现且可审核。

## 0.2 版本能力

- 接受公开 GitHub 仓库链接。
- 读取仓库元数据、Release 资产，以及少量标准构建清单，并从受支持的根清单中提取声明式依赖。
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
npm install --global https://github.com/lawushanshan/installermarker/releases/download/v0.2.8/installermarker-0.2.8.tgz
```

可使用 `installermarker --version` 查看当前安装的 CLI 版本。启用 npm 发布后，也可以使用 `npx installermarker` 运行相同命令。

需要下载到本地后再安装时，可先验证 Release 附带的 SHA-256 校验文件：

```bash
curl -LO https://github.com/lawushanshan/installermarker/releases/download/v0.2.8/installermarker-0.2.8.tgz
curl -LO https://github.com/lawushanshan/installermarker/releases/download/v0.2.8/installermarker-0.2.8.tgz.sha256
sha256sum -c installermarker-0.2.8.tgz.sha256 # Linux
shasum -a 256 -c installermarker-0.2.8.tgz.sha256 # macOS
gh attestation verify ./installermarker-0.2.8.tgz --repo lawushanshan/installermarker
npm install --global ./installermarker-0.2.8.tgz
```

```bash
installermarker https://github.com/owner/repository
installermarker https://github.com/owner/repository --recipe --format yaml
installermarker https://github.com/owner/repository --recipe --format json --output installermarker.json
installermarker validate installermarker.json
installermarker materialize installermarker.json --dry-run
installermarker materialize installermarker.json --output-dir artifacts/v1
installermarker materialize installermarker.json --target linux-x64 --output-dir artifacts/linux
installermarker verify artifacts/v1
installermarker sbom artifacts/v1 --format json > sbom.json
installermarker smoke-plan artifacts/v1 --format json > smoke-plan.json
installermarker smoke-verify artifacts/v1 --result smoke-result.json --format json > smoke-verification.json
installermarker sign-plan artifacts/v1 --format json > sign-plan.json
installermarker sign-verify artifacts/v1 --result sign-result.json --format json > sign-verification.json
installermarker scan-plan artifacts/v1 --format json > scan-plan.json
installermarker scan-verify artifacts/v1 --result scan-result.json --format json > scan-verification.json
installermarker release-plan artifacts/v1 --format json > release-plan.json
installermarker release-verify artifacts/v1 --smoke-result smoke-result.json --scan-result scan-result.json --sign-result sign-result.json --format json > release-verification.json
installermarker publish-plan artifacts/v1 --release-verification release-verification.json --release-tag v1.0.0 --format json > publish-plan.json
installermarker gate-verify release-gate-plans --format json > gate-verification.json
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

现在的分析报告还会包含只读的依赖清单，覆盖 `package.json`、`go.mod`、`Cargo.toml` 和 `requirements.txt` 等受支持的根清单，也会记录 `package-lock.json`、`go.sum`、`Cargo.lock` 等锁文件存在性，并附带一个小型风险扫描，用来标出明显的 file / VCS / URL / 额外索引引用。它只是元数据扫描，不会安装或执行任何依赖；锁文件仅从仓库树中检测存在性，不会下载完整内容。

当前 `materialize` 只接受公开安装包：URL 必须属于源仓库的 GitHub Releases，并且配方中必须存在 SHA-256。它会把选中的资产流式下载到临时目录，校验声明大小和摘要后，再连同 `artifacts.json` 来源清单一起提交到产物目录。使用 `--target` 可只选择一个平台；省略该参数则落盘配方中全部可复用安装包。它不会打开或安装这些文件，也绝不会覆盖已有产物。

使用 `verify <产物目录>` 可离线重新检查已有的 `artifacts.json` 或 `build-artifacts.json` 目录。它会验证安装包以及构建产出 SBOM 文档的清单格式、文件名、字节大小和 SHA-256，不会执行任何安装包。
使用 `sbom <产物目录>` 可以从已验证的清单派生只读的组件清单。对于源码构建输出，它会把已验证的构建产出 SBOM 文档作为证据带出。它同样不会执行或安装任何产物。
使用 `smoke-plan <产物目录>` 可以为每个已验证安装包生成只读的安装、启动和卸载检查计划。它不会执行计划，也不会运行安装器。
使用 `smoke-verify <产物目录> --result <smoke-result.json>` 可以把外部隔离 smoke runner 返回的结果与已验证产物目录及生成的 smoke 计划进行校验。它会检查源、清单、产物哈希、安装器类型、目标宿主、步骤名称、步骤状态和汇总结论，但不会安装、启动、卸载或执行任何产物。
使用 `sign-plan <产物目录>` 可以为独立受保护的签名服务生成只读签名请求计划。它不会访问证书、签名产物、执行公证或发布 Release。
使用 `sign-verify <产物目录> --result <sign-result.json>` 可以把外部受保护签名服务返回的结果与已验证产物目录及生成的签名计划进行校验。它会检查源、清单、产物哈希、签名 profile、阶段名称、阶段状态和汇总结论，但不会访问凭据、签名产物、执行公证或发布 Release。
使用 `scan-plan <产物目录>` 可以生成只读的恶意软件、信誉和 SBOM 关联扫描请求计划。它不会执行扫描器、上传产物或访问信誉服务。
使用 `scan-verify <产物目录> --result <scan-result.json>` 可以把外部批准扫描器返回的结果与已验证产物目录进行校验。它会检查源、清单、产物哈希、阶段状态和汇总结论，但不会调用扫描器或上传产物。
使用 `release-plan <产物目录>` 可以生成单个只读发布门禁计划，汇总验证证据、SBOM、冒烟测试计划、扫描计划和签名计划。它不会执行产物、运行冒烟测试、调用扫描器、签名产物、执行公证或发布 Release。
使用 `release-verify <产物目录> --smoke-result <smoke-result.json> --scan-result <scan-result.json> --sign-result <sign-result.json>` 可以重新验证本地产物，并把外部 smoke、扫描和签名原始结果聚合成最终发布证据报告。它会在本地重新运行三类结果校验器，不信任预先生成的校验报告。
使用 `publish-plan <产物目录> --release-verification <release-verification.json> --release-tag <tag>` 可以在最终发布证据通过后生成只读发布计划。它会校验最终证据与已验证产物目录一致，并输出草稿 Release 资产检查清单，其中包含安装包和补充证据文件的 SHA-256 哈希；但不会上传产物、创建 Release、发布包、签名产物、执行公证或访问外部服务。
使用 `gate-verify <发布门禁目录>` 可以校验 CI 生成的发布门禁 JSON 包。它会检查 `verify.json`、`sbom.json`、`smoke-plan.json`、`scan-plan.json`、`sign-plan.json` 和 `release-plan.json` 是否存在且内部事实一致。

对于尚未发布安装包的 Electron 和 Tauri 项目，请审核生成的源码构建配方、填写经过审核的 `build.command`，然后分别在原生目标系统上构建。Go、Rust 和 Python 项目会生成 `build-native` 目标：需先选择并审核原生打包命令与产物目录。Python 默认使用 `dist` 和 `build` 作为候选目录，但入口和打包器仍必须人工确认。Worker 只接受 Windows `.msi/.exe`、macOS `.dmg/.pkg` 和 Linux `.AppImage/.deb/.rpm` 包。如果已审核构建命令在配置的产物目录中输出了常见 SPDX 或 CycloneDX SBOM 文档，Worker 会复制并哈希记录为构建 SBOM 证据；它不会自行生成这些文档。详见[源码构建说明](docs/source-build.zh-CN.md)。

## 项目发布与维护

Pull Request 会在 Node.js 20 和 22 上执行语法检查、单元测试与 npm 包内容检查。推送 `v0.2.0` 这样的标签后，发布工作流会生成 npm tarball、SHA-256 校验文件和 GitHub Artifact Attestation，并附加到 GitHub Release。只有在仓库配置了 `NPM_TOKEN` 后才会发布 npm 包。

首次发布前，请创建 GitHub 仓库，将其添加为 `origin` 远端并推送 `main`：

```bash
git remote add origin https://github.com/<organization>/installermarker.git
git push -u origin main
```

已发布包的 `repository`、`bugs` 和 `homepage` 元数据指向本 GitHub 仓库；若仓库发生迁移，请同步更新这些字段。

建议为 `main` 开启分支保护：要求 CI 通过、要求 Pull Request 审核、禁止强制推送。GitHub Actions 应保持最小权限，并为发布凭据设置受保护的 environment。

仓库中的 [OpenSSF Scorecard 工作流](.github/workflows/scorecard.yml) 和 [CodeQL 工作流](.github/workflows/codeql.yml) 会检查供应链安全与 SAST 实践，在 `main` 推送时和每周定期运行，将 SARIF 结果上传到 Code Scanning，并保留短期 Scorecard SARIF Artifact 供审核。

## 范围与路线图

0.2 版本包含静态分析、固定 commit 的配方生成、已有安装包的校验落盘、已验证产物目录的只读 SBOM 投影、只读 smoke-test 计划生成、外部隔离 smoke 结果校验、只读签名请求计划、外部受保护签名结果校验、只读产物扫描请求计划、外部批准扫描器结果校验、最终发布证据聚合、只读发布请求计划和 publish-plan 工作流生成、只读发布门禁计划、发布门禁包一致性校验，以及带构建 provenance 和构建产出 SBOM 证据采集的 Electron/Tauri、Go、Rust、Python 源码构建路径。下一阶段将增加约定式打包适配器、更完整的构建期依赖 SBOM 生成、隔离的 smoke-test 执行集成、批准扫描器执行集成，以及受保护的签名服务。

Windows Authenticode 证书，以及 macOS Developer ID 和公证凭据，绝不能暴露给仓库的构建脚本。

更多信息请参阅：[贡献指南（中文）](CONTRIBUTING.zh-CN.md)、[安全策略（中文）](SECURITY.zh-CN.md)、[架构说明（中文）](docs/architecture.zh-CN.md)、[安装包落盘说明（中文）](docs/materialize.zh-CN.md)、[本地产物验证说明（中文）](docs/verify.zh-CN.md) 和 [发布指南（中文）](docs/releasing.zh-CN.md)。

版本变更见 [CHANGELOG.md](CHANGELOG.md)。

需要在仓库中无密钥执行落盘、发布门禁、发布证据和发布计划任务时，请参阅 [GitHub Actions Worker 说明](docs/github-actions.zh-CN.md)。

需要在受保护环境中完成 Windows、macOS、Linux 原生源码构建时，请参阅 [源码构建说明](docs/source-build.zh-CN.md)。
