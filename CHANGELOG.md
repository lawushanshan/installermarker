# Changelog

All notable changes to InstallerMarker are documented here. Versions follow Semantic Versioning.

## Unreleased

- Added a plan-only `release-plan` command that composes verification, SBOM, smoke-test, artifact-scan, and signing gates for verified artifact directories.
- Added a no-secret `release-gate` workflow that downloads a verified workflow artifact directory and uploads review JSON for verification, SBOM, smoke, scan, signing, and release gates.
- Added a no-secret `release-verify` workflow that downloads verified artifacts and raw external result JSON files, then uploads final release evidence verification.
- Captured build-produced SPDX/CycloneDX SBOM documents from reviewed source-build artifact directories as hashed build evidence.
- Added a read-only `gate-verify` command that validates release-gate JSON bundles for completeness and internal consistency.
- Added a read-only `scan-verify` command and scanner-result contract for validating externally produced approved-scanner results against verified artifact hashes.
- Added a read-only `smoke-verify` command and smoke-result contract for validating external isolated smoke-runner results against verified artifacts and generated smoke plans.
- Added a read-only `sign-verify` command and signing-result contract for validating external protected signing-service results against verified artifacts and generated signing plans.
- Added a read-only `release-verify` command that re-runs smoke, scan, and signing result verification from raw external results and aggregates final release evidence.
- Added a plan-only `publish-plan` command for turning valid final release evidence into a draft release asset checklist without contacting release services.
- Added a no-secret GitHub Actions workflow that generates `publish-plan.json` from verified installer artifacts and final release evidence.
- Publish plans now include SHA-256 hashes for required supplemental evidence files, including the artifact manifest and final release verification report.
- Added `publish-verify` for validating raw protected-release-service publication results against the generated publish plan without contacting release services.
- Added a no-secret GitHub Actions workflow that runs `publish-verify` and uploads `publish-verification.json`.
- Added Python packager hints for Briefcase, PyInstaller, Nuitka, and cx_Freeze in source-build detection, with structured recipe propagation and documentation updates.
- Centralized CLI command option policies to keep command growth explicit and reject ignored options consistently.
- Shared artifact-manifest projection helpers across read-only plan commands.

## 0.2.8 - 2026-08-01

- Added a reviewed `python-native` source-build strategy for Python projects detected from standard manifests.
- Added default Python artifact directories (`dist` and `build`) while keeping the entrypoint and packaging command explicit review items.
- Extended source-build artifact manifest validation to Go, Rust, and Python native strategies.

## 0.2.7 - 2026-08-01

- Added a pinned CodeQL workflow for JavaScript and TypeScript SAST analysis.
- Reduced Release token permissions to the release job instead of the workflow level.
- Added a direct private vulnerability reporting link to the security policy.

## 0.2.6 - 2026-08-01

- Added a scheduled OpenSSF Scorecard workflow with SARIF upload and immutable action pins.
- Added a short-retention SARIF artifact for offline review of supply-chain findings.

## 0.2.5 - 2026-08-01

- Added GitHub Artifact Attestations for release tarballs.
- Documented attestation verification alongside SHA-256 verification.

## 0.2.4 - 2026-08-01

- Publish a SHA-256 checksum alongside each GitHub Release tarball.
- Document verified local installation in English and Chinese.

## 0.2.3 - 2026-08-01

- Updated pinned GitHub Actions to the current Node 24-based major versions.
- Enabled Dependabot vulnerability alerts for the public repository.

## 0.2.2 - 2026-08-01

- Replaced the deprecated Node 20-based release action with the GitHub CLI available on hosted runners.
- Verified that release creation publishes exactly one packed CLI asset.

## 0.2.1 - 2026-08-01

- Fixed release tag version validation and documented GitHub Release installation.
- Updated pinned GitHub Actions to current Node 24-based major versions.

## 0.2.0 - 2026-08-01

- Added JSON Schema-backed `validate` command with CI strict mode.
- Added verified materialization of existing GitHub Release installers and provenance manifests.
- Added reviewed Electron and Tauri source-build recipes for Windows, macOS, and Linux native runners.
- Added protected GitHub Actions workflows for release materialization and source builds.
- Added source-build artifact manifests, pinned source revisions, architecture-aware asset selection, and Chinese documentation.
- Added reviewed `build-native` source-build targets for Go and Rust projects.
- Added SPDX license evidence to recipes and artifact provenance manifests.
- Added offline verification for materialized and source-build artifact manifests.
- Added optional target-platform selection for installer materialization.

## 0.1.0 - Unreleased

- Initial read-only GitHub repository inspection and installer recipe generation.
