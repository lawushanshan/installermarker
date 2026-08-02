# InstallerMarker

中文文档请见 [README.zh-CN.md](README.zh-CN.md)。

InstallerMarker is a safe first-pass analyzer for turning an open-source GitHub repository into a cross-platform installer plan. It does not claim that every repository can become a Windows, macOS, and Linux application automatically. Instead, it makes the packaging decision explicit, repeatable, and reviewable.

## What version 0.2 does

- Accepts a public GitHub repository URL.
- Reads repository metadata, release assets, and a small allowlist of standard manifest files, then extracts declared dependencies from supported root manifests.
- Resolves the default branch once and pins analysis and recipes to its immutable commit SHA.
- Detects common project families: Electron, Tauri, Go, Rust, Python, Java, Node.js, and container services.
- Assesses Windows x64, macOS, and Linux x64 independently as `available`, `likely`, or `needs_review`.
- Generates an editable installer recipe draft for later isolated builds.
- Materializes existing GitHub Release installers into a verified artifact directory without executing them.

It never clones, installs dependencies from, or executes the inspected repository. This is intentional: a URL submitted to an installer factory must be treated as untrusted input.

## Quick start

Requires Node.js 20 or later.

Install the current GitHub Release package:

```bash
npm install --global https://github.com/lawushanshan/installermarker/releases/download/v0.2.8/installermarker-0.2.8.tgz
```

Check the installed CLI version with `installermarker --version`. Once npm publishing is enabled, the same commands can also be run with `npx installermarker`.

To verify the downloaded release before installing it locally:

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
installermarker publish-verify artifacts/v1 --release-verification release-verification.json --release-tag v1.0.0 --result publish-result.json --format json > publish-verification.json
installermarker gate-verify release-gate-plans --format json > gate-verification.json
```

For private repositories or higher GitHub API limits, set a token with read-only repository access:

```bash
GITHUB_TOKEN=github_pat_xxx installermarker https://github.com/owner/repository --recipe
```

The token is used only for GitHub API requests during that invocation and is never written to disk.

## Interpretation

`available` means the latest GitHub release includes a target-specific delivery artifact. The generated recipe distinguishes a reusable installer (`.msi`, `.dmg`, `.pkg`, `.AppImage`, `.deb`, or `.rpm`) from an archive that still needs installer wrapping. `likely` means a well-known native cross-platform project family was detected, but it still needs an isolated build and smoke test. `needs_review` means the source evidence is insufficient; it is not a failure and should result in an explicit human decision.

The generated recipe deliberately contains `TODO` values for the executable entrypoint and build command. Confirm them before enabling any build worker.

Recipe files can be JSON or YAML. Use the matching `.json`, `.yaml`, or `.yml` filename extension so the CLI can parse the format deterministically.

Recipe output records the source commit and release-asset provenance. Output files are created without overwriting existing files; pass `--force` only when replacement is intentional. The JSON contract is documented in [`schema/installermarker.schema.json`](schema/installermarker.schema.json).

The recipe also records GitHub's SPDX license evidence. `NOASSERTION` is a review warning, not permission to redistribute: resolve licensing before publishing a repackaged application.

Use `validate` before materialization. It reports schema errors separately from unresolved review warnings. `validate --strict` returns a nonzero status for either errors or warnings and is intended for CI gates.

The inspection report now includes a read-only dependency inventory for supported root manifests such as `package.json`, `go.mod`, `Cargo.toml`, and `requirements.txt`, lockfile presence evidence such as `package-lock.json`, `go.sum`, and `Cargo.lock`, plus a small risk scan that flags obvious file, VCS, URL, and alternate-index references. It is a metadata scan only; no dependency is installed or executed, and lockfiles are detected from the repository tree rather than downloaded.

`materialize` currently accepts only public installers whose URL belongs to the source repository's GitHub Releases and whose SHA-256 digest is present in the recipe. It streams each selected asset into a staging directory, verifies its declared size and digest, and then publishes the files with an `artifacts.json` provenance manifest. Use `--target` to select one platform, or omit it to collect every reusable installer in the recipe. It neither opens nor installs the artifacts. Existing output files are never overwritten.

Use `verify <artifact-directory>` to recheck an existing `artifacts.json` or `build-artifacts.json` directory offline. It validates the manifest contract, filenames, byte sizes, and SHA-256 values for installers and any build-produced SBOM documents without executing any artifact.
Use `sbom <artifact-directory>` to derive a read-only component inventory from the verified manifest. For source-build outputs, it carries forward verified build-produced SBOM documents as evidence. It never executes or installs any artifact.
Use `smoke-plan <artifact-directory>` to derive a plan-only install/launch/uninstall checklist for each verified installer. It does not execute the plan or run installers.
Use `smoke-verify <artifact-directory> --result <smoke-result.json>` to validate an external isolated smoke-runner result against the verified artifact directory and generated smoke plan. It checks source, manifest, artifact hashes, installer types, target hosts, step names, step statuses, and summary verdicts, but does not install, launch, uninstall, or execute any artifact.
Use `sign-plan <artifact-directory>` to derive a plan-only signing request for a separately protected signing service. It does not access certificates, sign artifacts, notarize packages, or publish releases.
Use `sign-verify <artifact-directory> --result <sign-result.json>` to validate an external protected signing-service result against the verified artifact directory and generated signing plan. It checks source, manifest, artifact hashes, signing profiles, stage names, stage statuses, and summary verdicts, but does not access credentials, sign artifacts, notarize packages, or publish releases.
Use `scan-plan <artifact-directory>` to derive a plan-only malware/reputation/SBOM-correlation scan request. It does not execute scanners, upload artifacts, or contact reputation services.
Use `scan-verify <artifact-directory> --result <scan-result.json>` to validate an external approved scanner result against the verified artifact directory. It checks source, manifest, artifact hashes, stage statuses, and summary verdicts, but does not invoke scanners or upload artifacts.
Use `release-plan <artifact-directory>` to derive a single plan-only release gate that combines verification evidence, SBOM, smoke-test, scan, and signing plans. It does not execute artifacts, run smoke tests, invoke scanners, sign artifacts, notarize packages, or publish releases.
Use `release-verify <artifact-directory> --smoke-result <smoke-result.json> --scan-result <scan-result.json> --sign-result <sign-result.json>` to re-verify local artifacts and aggregate raw external smoke, scan, and signing results into one final release evidence report. It reruns all three result verifiers locally and does not trust precomputed verification reports.
Use `publish-plan <artifact-directory> --release-verification <release-verification.json> --release-tag <tag>` after final release evidence passes. It validates the final evidence against the verified artifact directory and emits a draft release asset checklist with SHA-256 hashes for installers and supplemental evidence files, but does not upload artifacts, create releases, publish packages, sign artifacts, notarize packages, or contact external services.
Use `publish-verify <artifact-directory> --release-verification <release-verification.json> --release-tag <tag> --result <publish-result.json>` after a protected release service returns raw publication results. It rebuilds the publish plan locally, checks source, manifest, release tag, draft state, release URL, asset names, asset types, SHA-256 hashes, and summary verdicts, but does not contact GitHub Releases or publish anything.
Use `gate-verify <release-gate-directory>` to validate a release-gate JSON bundle generated by CI. It checks that `verify.json`, `sbom.json`, `smoke-plan.json`, `scan-plan.json`, `sign-plan.json`, and `release-plan.json` are present and internally consistent.

For Electron and Tauri projects without ready-made installers, review the generated source-build recipe, set its reviewed `build.command`, and run one native build per target. Go, Rust, and Python projects receive a `build-native` target: select and review the native packaging command and output directory before execution. Python projects default to `dist` and `build`, but the entrypoint and packager remain explicit review items. The Worker accepts Windows `.msi`/`.exe`, macOS `.dmg`/`.pkg`, and Linux `.AppImage`/`.deb`/`.rpm` packages. If the reviewed build command emits common SPDX or CycloneDX SBOM documents inside the configured artifact directories, the Worker copies and hashes them as build SBOM evidence; it does not generate those documents itself. See [source builds](docs/source-build.md).

## Project lifecycle

Pull requests run syntax checks, unit tests, and a package-content check on Node.js 20 and 22. Pushing a tag such as `v0.2.0` creates an npm tarball, SHA-256 checksum, and GitHub Artifact Attestation, then attaches the assets to a GitHub Release. npm publishing is opt-in and requires configuring the `NPM_TOKEN` repository secret.

Before the first release, create a GitHub repository, add it as the `origin` remote, and push `main`:

```bash
git remote add origin https://github.com/<organization>/installermarker.git
git push -u origin main
```

The published package metadata points to this GitHub repository for source, issue tracking, and homepage links. Keep these fields aligned if the repository is transferred.

Enable branch protection for `main`: require the CI workflow, require pull-request review, and forbid force pushes. Configure GitHub Actions with minimal permissions and use a protected environment for release credentials.

The scheduled [OpenSSF Scorecard workflow](.github/workflows/scorecard.yml) and [CodeQL workflow](.github/workflows/codeql.yml) check the repository's supply-chain and SAST practices. They run on pushes to `main` and weekly, upload SARIF results to Code Scanning, and retain a short-lived Scorecard SARIF artifact for review.

## Scope and roadmap

Version 0.2 includes static analysis, pinned recipe generation, verified materialization of existing installers, reviewed Electron/Tauri, Go, Rust, and Python source-build paths with build provenance and build-produced SBOM evidence capture, read-only SBOM projection, plan-only smoke-test generation, external isolated smoke-result verification, plan-only signing requests, external protected signing-result verification, plan-only artifact scan requests, external approved scanner result verification, final release evidence aggregation, plan-only publish requests and publish-plan workflow generation, external protected publish-result verification and publish-verification workflow generation, a combined plan-only release gate for verified artifact directories, and release-gate bundle consistency verification. The next phase is opinionated packaging adapters, fuller dependency SBOM generation during builds, isolated smoke-test execution integration, approved scanner execution integration, and a protected signing service. Windows Authenticode and macOS Developer ID/notarization credentials must never be exposed to repository build scripts.

See [CONTRIBUTING.md](CONTRIBUTING.md), [SECURITY.md](SECURITY.md), [docs/architecture.md](docs/architecture.md), [docs/materialize.md](docs/materialize.md), [docs/verify.md](docs/verify.md), and [docs/releasing.md](docs/releasing.md).

Release history is maintained in [CHANGELOG.md](CHANGELOG.md).

For repository-managed, no-secret materialization, release-gate, release-evidence, publish-plan, and publish-verification runs, see [the GitHub Actions worker guide](docs/github-actions.md).

For native Windows, macOS, and Linux source builds in a protected environment, see [the source-build guide](docs/source-build.md).
