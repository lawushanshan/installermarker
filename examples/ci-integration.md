# CI 集成示例

本示例展示如何在 GitHub Actions 中使用 installermarker 自动化验证开源项目的安装包。

## 场景：自动验证 Release 安装包

当项目发布新版本时，自动验证所有平台的安装包是否可用、完整、可追溯。

## GitHub Actions 工作流

创建 `.github/workflows/verify-release.yml`：

```yaml
name: Verify Release Installers

on:
  release:
    types: [published]
  workflow_dispatch:
    inputs:
      repository:
        description: 'Repository to verify (owner/repo)'
        required: true
        type: string

permissions:
  contents: read

jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '22'

      - name: Install installermarker
        run: |
          # 从 GitHub Release 安装（npm 发布后可改为 npm install -g installermarker）
          npm install -g https://github.com/lawushanshan/installermarker/releases/download/v0.2.8/installermarker-0.2.8.tgz

      - name: Determine repository
        id: repo
        run: |
          if [ "${{ github.event_name }}" = "release" ]; then
            echo "repo=${{ github.repository }}" >> $GITHUB_OUTPUT
          else
            echo "repo=${{ inputs.repository }}" >> $GITHUB_OUTPUT
          fi

      - name: Inspect project
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          installermarker https://github.com/${{ steps.repo.outputs.repo }} \
            --recipe \
            --format json \
            -o recipe.json

      - name: Validate recipe
        run: |
          installermarker validate recipe.json --format json > validation.json
          cat validation.json

          # Check if ready for materialization
          READY=$(jq -r '.readyForMaterialize' validation.json)
          if [ "$READY" != "true" ]; then
            echo "::error::Recipe is not ready for materialization"
            jq '.errors' validation.json
            exit 1
          fi

      - name: Materialize installers
        run: |
          mkdir -p artifacts
          installermarker materialize recipe.json \
            --output-dir artifacts

      - name: Verify artifacts
        run: |
          installermarker verify artifacts --format json > verification.json
          cat verification.json

          VALID=$(jq -r '.valid' verification.json)
          if [ "$VALID" != "true" ]; then
            echo "::error::Artifact verification failed"
            jq '.errors' verification.json
            exit 1
          fi

      - name: Generate SBOM
        run: |
          installermarker sbom artifacts --format json > sbom.json
          echo "SBOM generated with $(jq '.components | length' sbom.json) components"

      - name: Upload artifacts
        uses: actions/upload-artifact@v4
        with:
          name: verified-installers
          path: |
            artifacts/
            recipe.json
            validation.json
            verification.json
            sbom.json
          retention-days: 30

      - name: Summary
        run: |
          echo "## Verification Summary" >> $GITHUB_STEP_SUMMARY
          echo "" >> $GITHUB_STEP_SUMMARY
          echo "- **Repository**: ${{ steps.repo.outputs.repo }}" >> $GITHUB_STEP_SUMMARY
          echo "- **Commit**: $(jq -r '.source.commit' verification.json | cut -c1-8)" >> $GITHUB_STEP_SUMMARY
          echo "- **Artifacts**: $(jq '.artifactCount' verification.json)" >> $GITHUB_STEP_SUMMARY
          echo "- **SBOM Components**: $(jq '.components | length' sbom.json)" >> $GITHUB_STEP_SUMMARY
          echo "- **Status**: ✅ All checks passed" >> $GITHUB_STEP_SUMMARY
```

## 工作流说明

### 触发条件

- **Release 发布时**：自动验证新发布的安装包
- **手动触发**：可以指定任意 GitHub 仓库进行验证

### 步骤详解

1. **Inspect**：分析项目并生成配方
2. **Validate**：验证配方的完整性和可执行性
3. **Materialize**：下载并验证安装包
4. **Verify**：确保物化结果与配方一致
5. **SBOM**：生成软件物料清单
6. **Upload**：上传所有证据文件

### 输出

工作流会生成以下文件：
- `recipe.json`：项目配方
- `validation.json`：配方验证结果
- `verification.json`：安装包验证结果
- `sbom.json`：软件物料清单
- `artifacts/`：物化的安装包目录

## 高级用法

### 多平台并行验证

```yaml
jobs:
  verify:
    strategy:
      matrix:
        platform: [windows-x64, macos-universal, linux-x64]
    runs-on: ${{ matrix.platform == 'windows-x64' && 'windows-latest' || matrix.platform == 'macos-universal' && 'macos-latest' || 'ubuntu-latest' }}
    steps:
      # ... same steps as above ...
      - name: Materialize for platform
        run: |
          installermarker materialize recipe.json \
            --target ${{ matrix.platform }} \
            --output-dir artifacts
```

### 发布前验证

在发布前验证安装包：

```yaml
on:
  pull_request:
    branches: [main]

jobs:
  pre-release-verify:
    runs-on: ubuntu-latest
    steps:
      # ... same verification steps ...
      - name: Comment on PR
        if: success()
        uses: actions/github-script@v7
        with:
          script: |
            github.rest.issues.createComment({
              issue_number: context.issue.number,
              owner: context.repo.owner,
              repo: context.repo.repo,
              body: '✅ Release verification passed! All installers are valid and traceable.'
            })
```

## 最佳实践

1. **使用 GITHUB_TOKEN**：自动提供，无需手动配置
2. **保留证据文件**：上传所有 JSON 文件作为审计证据
3. **设置保留期**：使用 `retention-days` 控制存储空间
4. **失败时快速反馈**：使用 `::error::` 标记失败步骤
5. **生成摘要**：使用 `$GITHUB_STEP_SUMMARY` 提供可读的验证报告

## 下一步

- 查看 [故障排除指南](./troubleshooting.md)
- 查看 [基础使用示例](./basic-usage.md)
