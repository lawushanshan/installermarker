# GitHub Actions Workers

[English](github-actions.md)

InstallerMarker 在 `.github/workflows/materialize.yml` 中提供了手动触发的工作流。将已审核的 JSON 或 YAML 配方保存在 InstallerMarker 控制仓库中，然后打开 **Actions**，选择 **Materialize Verified Installers**，并填写已经提交的配方路径。

工作流会：

1. 检出控制仓库，并在检出后禁用凭据保留。
2. 校验配方契约。
3. 只下载源仓库 GitHub Releases 中已固定摘要的安装包。
4. 将验证后的文件和 `artifacts.json` 作为短期 GitHub Actions Artifact 上传。

它只拥有 `contents: read` 权限，不使用仓库密钥，不检出目标仓库，也不会执行或安装下载文件。工作流会传入 `--recipe-root "$GITHUB_WORKSPACE"`，因此手动触发时不能通过输入路径或符号链接读取控制仓库以外的配方。即使源代码构建字段还没有完成，工作流仍可物化已有安装包；源码构建被刻意排除在该工作流之外。

启用前请保护默认分支，并限制可以手动触发工作流的成员。所有配方变更都应按代码审查，因为配方会在经过 GitHub Release 来源校验的范围内选择外部下载地址。

## 发布门禁计划

当安装包落盘或源码构建工作流已经上传了已验证产物目录后，可以使用 `.github/workflows/release-gate.yml` 生成下一步发布决策需要的审查载荷。打开 **Actions**，选择 **Release Gate Plan**，并填写：

- `source_run_id`：生成已验证产物目录的 workflow run ID。
- `artifact_name`：上传的 artifact 名称，例如 `verified-installers-<run_id>` 或 `built-installers-linux-<run_id>`。

该工作流会下载对应的 GitHub Actions artifact，依次运行 `verify`、`sbom`、`smoke-plan`、`scan-plan`、`sign-plan`、`release-plan` 和 `gate-verify`，然后把生成的 JSON 文件作为 `release-gate-plans-<run_id>` 上传。其中 `gate-verification.json` 是这组审查包自身的机器可读一致性报告；如果缺少必要 JSON 文件，或某个文件与 `verify.json` 记录的事实冲突，工作流会失败。

这个工作流只拥有 `actions: read` 和 `contents: read` 权限，不使用仓库密钥，不运行安装包，不执行冒烟测试，不调用扫描器，不签名或公证产物，也不会发布 Release。它的输出应作为审查包；只有审查通过后，后续受保护的扫描、签名、公证或发布服务才应消费这些已验证安装包。

## 发布证据校验

当外部隔离 smoke、批准扫描和受保护签名服务已经上传原始结果文件后，可以使用 `.github/workflows/release-verify.yml` 聚合最终发布证据。打开 **Actions**，选择 **Release Evidence Verification**，并填写：

- `source_run_id`：生成已验证产物目录的 workflow run ID。
- `artifact_name`：包含 `artifacts.json` 或 `build-artifacts.json` 以及安装包的 artifact 名称。
- `evidence_run_id`：上传外部原始结果文件的 workflow run ID。
- `evidence_artifact_name`：根目录包含 `smoke-result.json`、`scan-result.json` 和 `sign-result.json` 的 artifact 名称。

该工作流会下载两组 artifact，运行 `release-verify`，并把 `release-verification.json` 作为 `release-verification-<run_id>` 上传。该命令会重新验证本地产物哈希，并从原始外部结果文件重新运行 smoke、扫描和签名结果校验；它不信任预先生成的校验报告。

这个工作流同样只拥有 `actions: read` 和 `contents: read` 权限，不使用仓库密钥，不运行安装包，不调用扫描器，不访问签名凭据，不签名或公证产物，也不会发布 Release。

## 安装包发布计划

当 `release-verify` 已经上传有效的最终证据报告后，可以使用 `.github/workflows/publish-plan.yml` 生成草稿发布检查清单。打开 **Actions**，选择 **Installer Artifact Publish Plan**，并填写：

- `source_run_id`：生成已验证产物目录的 workflow run ID。
- `artifact_name`：包含 `artifacts.json` 或 `build-artifacts.json` 以及安装包的 artifact 名称。
- `verification_run_id`：上传 `release-verification.json` 的 workflow run ID。
- `verification_artifact_name`：包含 `release-verification.json` 的 artifact 名称。
- `release_tag`：写入 `publish-plan.json` 的草稿发布标签，例如 `v1.0.0`。

该工作流会下载两组 artifact，运行 `publish-plan`，并把 `publish-plan.json` 作为 `publish-plan-<run_id>` 上传。该命令会重新验证本地产物目录，校验最终发布证据契约，检查证据是否属于同一来源和清单，并记录发布审核时必须保持不变的产物文件名和 SHA-256 哈希。

这个工作流只拥有 `actions: read` 和 `contents: read` 权限，不使用仓库密钥，不运行安装包，不调用扫描器，不访问签名凭据，不签名或公证产物，不创建 GitHub Release，也不会发布包。它的输出应作为人工发布检查清单，或作为单独审查过的受保护发布服务输入。
