# 验证本地安装包产物

[English](verify.md)

在复制、归档或传输 InstallerMarker 产物目录后，使用 `verify` 重新验证：

```bash
installermarker verify artifacts/linux
installermarker verify artifacts/linux --format json
```

目录必须恰好包含一种受支持的清单：`materialize` 生成的 `artifacts.json`，或 `build` 生成的 `build-artifacts.json`。命令会验证清单 Schema，拒绝符号链接和不安全文件名，并重新计算每个安装包以及清单记录的构建产出 SBOM 文档的大小与 SHA-256。它不会执行、挂载或安装任何产物。

验证只能证明文件相对于清单的完整性，不能证明安装包无害，也不代表获得再分发许可；发布前仍须审核记录的源代码和许可证证据。

使用 `installermarker sbom artifacts/linux --format json` 可以把已验证清单投影成只读的组件清单。对于源码构建输出，它还会把已验证的构建产出 SBOM 文档作为证据带出。这个命令同样保持离线，也不会执行任何产物。

使用 `installermarker smoke-plan artifacts/linux --format json` 可以为每个已验证安装包生成只读的安装、启动和卸载检查计划。它不会执行这份计划；真正运行必须放在后续隔离的原生宿主环境中。

使用 `installermarker sign-plan artifacts/linux --format json` 可以为受保护签名服务生成只读签名请求。它会记录预期签名 profile 和阶段，但不会访问凭据，也不会调用签名工具。

使用 `installermarker scan-plan artifacts/linux --format json` 可以生成只读的恶意软件、信誉和 SBOM 关联扫描请求。它只记录后续应该扫描什么，不会上传产物，也不会调用扫描器。

在独立批准的扫描器返回结果文件后，可以使用 `installermarker scan-verify artifacts/linux --result scan-result.json --format json`。该命令会重新验证本地产物目录，校验扫描结果契约，并检查扫描器记录的源、清单、产物哈希、阶段状态和汇总结论是否与已验证产物一致。它不会上传产物，也不会调用扫描器。

使用 `installermarker release-plan artifacts/linux --format json` 可以生成单个只读发布门禁计划。它会先验证本地产物完整性，再把 SBOM、冒烟测试、扫描和签名计划组合成一份可审核载荷。它不会执行产物、运行冒烟测试、调用扫描器、签名产物、执行公证或发布 Release。

使用 `installermarker gate-verify release-gate-plans --format json` 可以校验 CI 生成的发布门禁包。它会检查独立 JSON 文件以及 `release-plan.json` 内嵌计划是否都与 `verify.json` 记录的事实一致。
