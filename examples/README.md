# 示例目录

本目录包含 installermarker 的使用示例和最佳实践。

## 示例列表

### [基础使用示例](./basic-usage.md)

展示如何使用 installermarker 分析、验证和物化一个开源项目的安装包。

**包含内容**：
- 完整的工作流程演示（inspect → validate → materialize → verify）
- 使用真实项目 exelban/stats 作为示例
- 每个步骤的详细输出说明
- 关键概念解释

**适合人群**：初次使用 installermarker 的用户

---

### [CI 集成示例](./ci-integration.md)

展示如何在 GitHub Actions 中自动化验证开源项目的安装包。

**包含内容**：
- 完整的 GitHub Actions 工作流配置
- Release 发布时自动验证
- 手动触发验证任意仓库
- 多平台并行验证
- 发布前验证（PR 检查）

**适合人群**：希望自动化验证流程的项目维护者

---

### [故障排除指南](./troubleshooting.md)

解决使用 installermarker 时遇到的常见问题。

**包含内容**：
- 认证问题（401、403、速率限制）
- 网络问题（超时、连接失败）
- 配方问题（验证失败、TODO 字段）
- 物化问题（哈希不匹配、文件覆盖）
- 验证问题（清单缺失、数量不符）
- 调试技巧

**适合人群**：遇到问题需要排查的用户

---

## 快速开始

```bash
# 1. 安装 installermarker
npm install -g installermarker

# 2. 设置 GitHub Token
export GITHUB_TOKEN=github_pat_xxxxx

# 3. 分析项目
installermarker https://github.com/exelban/stats --recipe -o recipe.json

# 4. 验证配方
installermarker validate recipe.json

# 5. 物化安装包
mkdir artifacts
installermarker materialize recipe.json --output-dir artifacts

# 6. 验证结果
installermarker verify artifacts
```

详细步骤请查看 [基础使用示例](./basic-usage.md)。

---

## 其他资源

- [主 README](../README.md) - 项目概述和安装说明
- [文档目录](../docs/) - 详细的技术文档
- [Schema 定义](../schema/) - JSON Schema 规范
- [更新日志](../CHANGELOG.md) - 版本历史记录

---

## 贡献示例

如果您有好的使用示例想要分享，欢迎提交 Pull Request！

请确保：
1. 示例真实可用，经过验证
2. 包含清晰的步骤说明
3. 提供预期的输出示例
4. 遵循现有的文档风格
