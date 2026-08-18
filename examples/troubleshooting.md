# 故障排除指南

本指南帮助您解决使用 installermarker 时遇到的常见问题。

## 目录

- [认证问题](#认证问题)
- [网络问题](#网络问题)
- [配方问题](#配方问题)
- [物化问题](#物化问题)
- [验证问题](#验证问题)

---

## 认证问题

### 错误：GitHub API 401 Unauthorized

**原因**：未提供 GitHub Token 或 Token 无效。

**解决方案**：

```bash
# 1. 生成 Personal Access Token
# 访问 https://github.com/settings/tokens
# 创建新 token，至少需要以下权限：
# - repo:status
# - repo_deployment
# - public_repo

# 2. 设置环境变量
export GITHUB_TOKEN=github_pat_xxxxx

# 3. 或使用 --token 参数
installermarker https://github.com/owner/repo --token $GITHUB_TOKEN
```

### 错误：GitHub API 403 Forbidden (rate limit)

**原因**：达到 GitHub API 速率限制。

**解决方案**：

```bash
# 1. 检查当前速率限制
curl -H "Authorization: token $GITHUB_TOKEN" \
  https://api.github.com/rate_limit

# 2. 等待限制重置（通常 1 小时）
# 3. 或使用缓存的配方文件
installermarker validate cached-recipe.json
```

---

## 网络问题

### 错误：GitHub API request timed out

**原因**：GitHub API 响应缓慢或网络不稳定。

**解决方案**：

```bash
# 1. 增加超时时间（默认 15000ms）
export INSTALLERMARKER_TIMEOUT_MS=60000
installermarker https://github.com/owner/repo

# 2. 检查网络连接
curl -I https://api.github.com

# 3. 使用代理（如需要）
export HTTPS_PROXY=http://proxy.example.com:8080
```

### 错误：Download timed out

**原因**：下载安装包时超时（默认 600000ms = 10 分钟）。

**解决方案**：

```bash
# 1. 增加下载超时时间
export INSTALLERMARKER_DOWNLOAD_TIMEOUT_MS=1800000  # 30 分钟
installermarker materialize recipe.json --output-dir ./artifacts

# 2. 检查文件大小
# 如果文件非常大（>1GB），考虑使用更快的网络

# 3. 分平台物化
installermarker materialize recipe.json \
  --target macos-universal \
  --output-dir ./artifacts
```

---

## 配方问题

### 错误：Recipe validation failed

**原因**：配方包含未解决的 TODO 或无效字段。

**解决方案**：

```bash
# 1. 查看详细错误
installermarker validate recipe.json --format json | jq '.errors'

# 2. 常见错误及修复

# 错误：entrypoint 包含 TODO
# 修复：编辑 recipe.json，设置正确的入口点
{
  "application": {
    "name": "myapp",
    "entrypoint": "MyApp.app"  # 而不是 "TODO: confirm executable entrypoint"
  }
}

# 错误：build.command 包含 TODO
# 修复：设置正确的构建命令
{
  "build": {
    "strategy": "electron",
    "command": "npm ci && npm run dist",  # 而不是 "TODO: ..."
    "artifactDirectories": ["dist", "out"]
  }
}

# 错误：packaging 为 TODO
# 修复：选择正确的打包策略
{
  "targets": [{
    "platform": "macos-universal",
    "status": "available",
    "packaging": "reuse-installer"  # 而不是 "TODO: select packager"
  }]
}
```

### 错误：readyForMaterialize is false

**原因**：配方验证通过，但不满足物化条件。

**解决方案**：

```bash
# 1. 查看警告信息
installermarker validate recipe.json --format json | jq '.warnings'

# 2. 常见警告及处理

# 警告：digest-missing
# 说明：安装包缺少 SHA-256 摘要
# 处理：手动计算并添加 digest
{
  "input": {
    "name": "app.dmg",
    "url": "https://...",
    "size": 12345678,
    "digest": "sha256:$(shasum -a 256 app.dmg | cut -d' ' -f1)"
  }
}

# 警告：license-unresolved
# 说明：许可证未识别
# 处理：确认许可证兼容性，或添加到 review 列表
{
  "review": [{
    "code": "license-unresolved",
    "message": "License NOASSERTION requires manual review",
    "severity": "warning"
  }]
}

# 警告：materialization-unavailable
# 说明：目标平台无法物化
# 处理：检查 packaging 策略，或跳过该平台
```

---

## 物化问题

### 错误：No reusable installer target exists

**原因**：配方中没有可物化的目标。

**解决方案**：

```bash
# 1. 检查配方中的目标
jq '.targets[] | {platform, status, packaging}' recipe.json

# 2. 确保至少有一个目标满足：
#    - status: "available"
#    - packaging: "reuse-installer"

# 3. 如果所有目标都是 wrap-release-asset
# 说明需要包装而不是直接复用
# 这种情况下需要使用 build 命令而不是 materialize
```

### 错误：SHA-256 mismatch

**原因**：下载的文件哈希与配方中的 digest 不匹配。

**解决方案**：

```bash
# 1. 重新下载（可能是临时网络问题）
rm -rf artifacts/
installermarker materialize recipe.json --output-dir artifacts

# 2. 如果持续失败，更新配方中的 digest
# 计算实际文件的哈希
shasum -a 256 artifacts/app.dmg

# 更新 recipe.json 中的 digest
{
  "input": {
    "digest": "sha256:actual_hash_here"
  }
}

# 3. 验证更新后的配方
installermarker validate recipe.json
```

### 错误：Refusing to overwrite existing output

**原因**：输出目录已存在同名文件。

**解决方案**：

```bash
# 1. 清理输出目录
rm -rf artifacts/
mkdir artifacts

# 2. 或使用新的输出目录
installermarker materialize recipe.json --output-dir artifacts-v2

# 3. 检查是否有残留的物化过程
ps aux | grep installermarker
```

---

## 验证问题

### 错误：Artifact verification failed

**原因**：物化的安装包与配方不一致。

**解决方案**：

```bash
# 1. 查看详细错误
installermarker verify artifacts --format json | jq '.errors'

# 2. 常见错误及修复

# 错误：artifact-count-mismatch
# 说明：实际文件数量与配方不符
# 修复：检查 artifacts/ 目录，确保所有文件都已下载

# 错误：hash-mismatch
# 说明：文件哈希不匹配
# 修复：重新物化，或更新配方中的 digest

# 错误：size-mismatch
# 说明：文件大小不匹配
# 修复：可能是下载不完整，重新物化

# 3. 重新物化
rm -rf artifacts/
installermarker materialize recipe.json --output-dir artifacts
installermarker verify artifacts
```

### 错误：Manifest not found

**原因**：artifacts 目录缺少 artifacts.json 清单文件。

**解决方案**：

```bash
# 1. 检查目录结构
ls -la artifacts/
# 应该包含：
# - artifacts.json
# - app.dmg (或其他安装包)

# 2. 如果缺少 artifacts.json，重新物化
installermarker materialize recipe.json --output-dir artifacts

# 3. 手动检查清单内容
cat artifacts/artifacts.json | jq
```

---

## 调试技巧

### 启用详细日志

```bash
# 使用 --format json 获取结构化输出
installermarker validate recipe.json --format json | jq

# 检查每个步骤的输出
installermarker inspect https://github.com/owner/repo --format json > inspect.json
installermarker validate recipe.json --format json > validate.json
installermarker materialize recipe.json --output-dir artifacts 2>&1 | tee materialize.log
```

### 检查配方内容

```bash
# 查看配方摘要
jq '{
  source: .source.repository + "@" + .source.commit[0:8],
  application: .application.name,
  targets: [.targets[] | {platform, status, packaging}]
}' recipe.json

# 检查特定目标
jq '.targets[] | select(.platform == "macos-universal")' recipe.json
```

### 验证文件完整性

```bash
# 检查文件大小
ls -lh artifacts/

# 计算文件哈希
shasum -a 256 artifacts/*.dmg

# 与配方对比
jq -r '.targets[] | select(.platform == "macos-universal") | .input.digest' recipe.json
```

---

## 获取帮助

如果以上方法都无法解决问题：

1. **查看文档**：[README.md](../README.md) 和 [docs/](../docs/)
2. **检查示例**：[examples/](./) 目录
3. **查看日志**：检查所有命令的 JSON 输出
4. **提交 Issue**：在 GitHub 上提交问题，附上：
   - 完整的错误信息
   - 配方文件（脱敏后）
   - Node.js 版本：`node --version`
   - installermarker 版本：`installermarker --version`

---

## 相关链接

- [基础使用示例](./basic-usage.md)
- [CI 集成示例](./ci-integration.md)
- [主 README](../README.md)
