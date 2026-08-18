# 基础使用示例

本示例展示如何使用 installermarker 分析、验证和物化一个开源项目的安装包。

## 场景：分析 exelban/stats

[stats](https://github.com/exelban/stats) 是一个 macOS 系统监控工具，提供多平台安装包。

### 步骤 1：检查项目

```bash
# 分析项目并生成配方（注意：必须显式指定 --format json）
GITHUB_TOKEN=github_pat_xxx installermarker https://github.com/exelban/stats --recipe --format json -o stats-recipe.json

# 查看生成的配方
cat stats-recipe.json
```

输出示例：
```json
{
  "schemaVersion": 1,
  "source": {
    "repository": "https://github.com/exelban/stats",
    "branch": "master",
    "commit": "39b5555fbd8ad5c513253a9076329571ca400b06",
    "license": "MIT"
  },
  "application": {
    "name": "stats",
    "entrypoint": "TODO: confirm executable entrypoint"
  },
  "build": {
    "strategy": "manual",
    "command": "TODO: confirm reproducible build command",
    "artifactDirectories": []
  },
  "targets": [
    {
      "platform": "windows-x64",
      "status": "needs_review",
      "packaging": "TODO: select packager"
    },
    {
      "platform": "macos-universal",
      "status": "available",
      "packaging": "reuse-installer",
      "input": {
        "name": "Stats.dmg",
        "url": "https://github.com/exelban/stats/releases/download/v3.0.11/Stats.dmg",
        "size": 7496768,
        "digest": "sha256:a22f75a04d23e76c0404a5108f4ac9facec975460d764aae80295a63d771e05b"
      }
    },
    {
      "platform": "linux-x64",
      "status": "needs_review",
      "packaging": "TODO: select packager"
    }
  ],
  "review": [
    "Confirm license permits redistribution.",
    "Confirm the entrypoint and persistent data directory.",
    "Run builds in isolated CI workers before signing."
  ]
}
```

**注意**：生成的配方包含 `TODO` 字段，表示需要人工确认。对于物化（materialize）流程，这些 TODO 不会阻止操作，但建议根据实际情况填写。

### 步骤 2：验证配方

```bash
# 验证配方的完整性和可执行性
installermarker validate stats-recipe.json --format json
```

输出示例：
```json
{
  "valid": true,
  "readyForMaterialize": true,
  "readyForBuild": false,
  "materializableTargets": [
    {
      "platform": "macos-universal",
      "name": "Stats.dmg",
      "url": "https://github.com/exelban/stats/releases/download/v3.0.11/Stats.dmg",
      "expectedSize": 7496768,
      "expectedSha256": "a22f75a04d23e76c0404a5108f4ac9facec975460d764aae80295a63d771e05b"
    }
  ],
  "buildableTargets": [],
  "errors": [],
  "warnings": [
    {
      "severity": "warning",
      "code": "entrypoint-unresolved",
      "path": "/application/entrypoint",
      "message": "Application entrypoint still needs review.",
      "blocks": []
    },
    {
      "severity": "warning",
      "code": "build-command-unresolved",
      "path": "/build/command",
      "message": "Build command still needs review.",
      "blocks": ["build"]
    }
  ]
}
```

**说明**：
- `readyForMaterialize: true` 表示可以物化安装包
- `readyForBuild: false` 表示构建流程还需要确认 TODO 字段
- `warnings` 中的 TODO 不会阻止物化，但建议根据实际情况填写

### 步骤 3：物化安装包

```bash
# 下载并验证安装包
mkdir -p ./artifacts
installermarker materialize stats-recipe.json --output-dir ./artifacts
```

输出示例：
```
Materializing macos-universal: Stats.dmg
Downloaded 7.5 MB in 12.3s
Verified SHA-256: a22f75a04d23e76c0404a5108f4ac9facec975460d764aae80295a63d771e05b
Materialized 1 verified installer(s) in ./artifacts
```

### 步骤 4：验证物化结果

```bash
# 验证物化的安装包
installermarker verify ./artifacts --format json
```

输出示例：
```json
{
  "schemaVersion": 1,
  "generatedAt": "2026-08-18T10:05:00.000Z",
  "valid": true,
  "source": {
    "repository": "https://github.com/exelban/stats",
    "commit": "39b5555fbd8ad5c513253a9076329571ca400b06",
    "license": "MIT"
  },
  "manifest": "artifacts.json",
  "artifactCount": 1,
  "artifacts": [
    {
      "platform": "macos-universal",
      "name": "Stats.dmg",
      "size": 7496768,
      "sha256": "a22f75a04d23e76c0404a5108f4ac9facec975460d764aae80295a63d771e05b"
    }
  ]
}
```

## 关键概念

### 配方（Recipe）

配方是 installermarker 的核心概念，描述了：
- 源代码位置（repository + commit）
- 应用信息（name + entrypoint）
- 构建策略（strategy + command）
- 目标平台及其安装包信息

### 物化（Materialize）

物化是指从 GitHub Releases 下载已验证的安装包，并生成本地的 `artifacts.json` 清单。

### 验证（Verify）

验证确保物化的安装包与配方中的描述一致，包括：
- SHA-256 哈希匹配
- 文件大小匹配
- 平台标签正确

## 下一步

- 查看 [CI 集成示例](./ci-integration.md)
- 查看 [故障排除指南](./troubleshooting.md)
