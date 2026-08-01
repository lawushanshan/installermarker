# InstallerMarker

中文文档请见 [README.zh-CN.md](README.zh-CN.md)。

InstallerMarker is a safe first-pass analyzer for turning an open-source GitHub repository into a cross-platform installer plan. It does not claim that every repository can become a Windows, macOS, and Linux application automatically. Instead, it makes the packaging decision explicit, repeatable, and reviewable.

## What version 0.2 does

- Accepts a public GitHub repository URL.
- Reads repository metadata, release assets, and a small allowlist of standard manifest files.
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
npm install --global https://github.com/lawushanshan/installermarker/releases/download/v0.2.5/installermarker-0.2.5.tgz
```

Check the installed CLI version with `installermarker --version`. Once npm publishing is enabled, the same commands can also be run with `npx installermarker`.

To verify the downloaded release before installing it locally:

```bash
curl -LO https://github.com/lawushanshan/installermarker/releases/download/v0.2.5/installermarker-0.2.5.tgz
curl -LO https://github.com/lawushanshan/installermarker/releases/download/v0.2.5/installermarker-0.2.5.tgz.sha256
sha256sum -c installermarker-0.2.5.tgz.sha256 # Linux
shasum -a 256 -c installermarker-0.2.5.tgz.sha256 # macOS
gh attestation verify ./installermarker-0.2.5.tgz --repo lawushanshan/installermarker
npm install --global ./installermarker-0.2.5.tgz
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

`materialize` currently accepts only public installers whose URL belongs to the source repository's GitHub Releases and whose SHA-256 digest is present in the recipe. It streams each selected asset into a staging directory, verifies its declared size and digest, and then publishes the files with an `artifacts.json` provenance manifest. Use `--target` to select one platform, or omit it to collect every reusable installer in the recipe. It neither opens nor installs the artifacts. Existing output files are never overwritten.

Use `verify <artifact-directory>` to recheck an existing `artifacts.json` or `build-artifacts.json` directory offline. It validates the manifest contract, filenames, byte sizes, and SHA-256 values without executing any artifact.

For Electron and Tauri projects without ready-made installers, review the generated source-build recipe, set its reviewed `build.command`, and run one native build per target. Go and Rust projects receive a `build-native` target: select and review the native packaging command and output directory before execution. The Worker accepts Windows `.msi`/`.exe`, macOS `.dmg`/`.pkg`, and Linux `.AppImage`/`.deb`/`.rpm` packages. See [source builds](docs/source-build.md).

## Project lifecycle

Pull requests run syntax checks, unit tests, and a package-content check on Node.js 20 and 22. Pushing a tag such as `v0.2.0` creates an npm tarball, SHA-256 checksum, and GitHub Artifact Attestation, then attaches the assets to a GitHub Release. npm publishing is opt-in and requires configuring the `NPM_TOKEN` repository secret.

Before the first release, create a GitHub repository, add it as the `origin` remote, and push `main`:

```bash
git remote add origin https://github.com/<organization>/installermarker.git
git push -u origin main
```

The published package metadata points to this GitHub repository for source, issue tracking, and homepage links. Keep these fields aligned if the repository is transferred.

Enable branch protection for `main`: require the CI workflow, require pull-request review, and forbid force pushes. Configure GitHub Actions with minimal permissions and use a protected environment for release credentials.

## Scope and roadmap

Version 0.2 includes static analysis, pinned recipe generation, verified materialization of existing installers, and reviewed Electron/Tauri, Go, and Rust source-build paths. The next phase is opinionated packaging adapters for Go/Rust, support for Python and other project families, SBOM generation, malware/dependency scans, install/uninstall smoke tests, and signing isolated from untrusted builds. Windows Authenticode and macOS Developer ID/notarization credentials must never be exposed to repository build scripts.

See [CONTRIBUTING.md](CONTRIBUTING.md), [SECURITY.md](SECURITY.md), [docs/architecture.md](docs/architecture.md), [docs/materialize.md](docs/materialize.md), [docs/verify.md](docs/verify.md), and [docs/releasing.md](docs/releasing.md).

Release history is maintained in [CHANGELOG.md](CHANGELOG.md).

For a repository-managed, no-secret materialization run, see [the GitHub Actions worker guide](docs/github-actions.md).

For native Windows, macOS, and Linux source builds in a protected environment, see [the source-build guide](docs/source-build.md).
