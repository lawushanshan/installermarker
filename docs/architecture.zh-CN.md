# 架构说明

[English](architecture.md)

InstallerMarker 将发现阶段和执行阶段严格分离。

```text
GitHub URL -> 只读分析 -> 评估结果与配方 -> 经审核的构建请求
                                           -> 隔离的目标平台 Worker -> 签名 -> 发布
```

当前 CLI 已实现只读发现、固定 commit 的配方、已有安装包的受限 Worker，以及 Electron/Tauri 和经审核人配置的 Go/Rust/Python 原生打包源码构建 Worker。发现阶段先将默认分支解析成不可变 commit，再通过 GitHub REST API 获取该 commit 对应的文件树、允许读取的标准清单文件、受支持清单中的声明式依赖清单、从文件树检测到的锁文件存在性、小型依赖风险扫描，以及最新 Release。落盘阶段只能下载该仓库公开 GitHub Releases 中、已经固定摘要的安装包；安装包和目标仓库中的任何指令都不会被作为命令执行。

## 配方约定

配方以 JSON 或 YAML 生成，应该与打包配置一同提交到版本控制。它记录源仓库和 commit SHA、所选 Release 资产的来源信息、建议的构建策略、各目标平台状态和待审核项。配方只是草案，不是构建授权。机器可读的 JSON 约定位于 `schema/installermarker.schema.json`。

未来的 Worker 必须要求已经审核的配方，并验证其中固定的 commit 和输入资产摘要。每个目标平台都应该在临时环境中构建，记录构建溯源信息和 SBOM，执行安装/卸载冒烟测试，并且只能将最终产物提交给受独立保护的签名服务。

源码构建 Worker 是对“默认不执行”的显式例外：它要求经过审核的命令和确认参数，验证原生宿主系统目标，在固定 commit 克隆公开源码，使用隔离 home 且不继承凭据变量运行，并且只从经过审核的目录收集平台对应安装包。如果经过审核的构建在这些目录中输出了常见 SPDX 或 CycloneDX SBOM 文档，Worker 会复制并哈希记录为构建 SBOM 证据；它不会自行生成或补全这些文档。Electron/Tauri 可以给出建议命令；Go/Rust/Python 的原生打包命令必须由审核人选择。托管 GitHub Actions 运行必须置于受保护的 `source-build` environment 后。

当前落盘 Worker 的范围刻意保持很小。它会验证资产所属仓库、平台对应的安装包扩展名、声明大小、单文件 1 GiB 上限、HTTPS 重定向目标和 SHA-256。所有下载都保留在随机 staging 目录中，直到选中的资产全部通过验证；它拒绝覆盖已有文件，并生成由 `schema/artifact-manifest.schema.json` 描述的 `artifacts.json`。

当前 CLI 还提供了面向已验证产物目录的只读投影。`sbom` 会从清单派生机器可读的组件清单，`smoke-plan` 会为每个安装包派生安装、启动和卸载检查计划，`sign-plan` 会为独立受保护的签名服务派生签名请求，`scan-plan` 会派生恶意软件、信誉和 SBOM 关联扫描请求，`release-plan` 会把这些门禁组合成一份可审核的发布载荷，`gate-verify` 会校验 CI 生成的发布门禁 JSON 包是否完整且内部一致；这些命令都不会执行产物、上传样本、访问扫描服务、发布 Release，也不会访问签名凭据。

## 目标平台策略

Release 中的目标平台安装资产是直接证据。没有该证据时，Go、Rust、Python、Electron 和 Tauri 会被标记为 `likely`，因为这些项目通常具备跨平台编译路径；这不是支持该平台的证明。其他检测到的项目类型在明确选择打包器和运行时策略前均为 `needs_review`。
