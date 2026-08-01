# 验证本地安装包产物

[English](verify.md)

在复制、归档或传输 InstallerMarker 产物目录后，使用 `verify` 重新验证：

```bash
installermarker verify artifacts/linux
installermarker verify artifacts/linux --format json
```

目录必须恰好包含一种受支持的清单：`materialize` 生成的 `artifacts.json`，或 `build` 生成的 `build-artifacts.json`。命令会验证清单 Schema，拒绝符号链接和不安全文件名，并重新计算每个安装包的大小与 SHA-256。它不会执行、挂载或安装任何产物。

验证只能证明文件相对于清单的完整性，不能证明安装包无害，也不代表获得再分发许可；发布前仍须审核记录的源代码和许可证证据。