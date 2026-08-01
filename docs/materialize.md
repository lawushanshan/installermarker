# Materializing existing installers

The `materialize` command is the first restricted worker. It downloads installers already published by a repository, verifies them, and creates a provenance manifest. It does not execute, install, repackage, or sign anything.

Generate a JSON or YAML recipe, review its source commit and targets, and preview the download plan:

```bash
installermarker inspect https://github.com/owner/repository \
  --recipe --format json --output installermarker.json
installermarker validate installermarker.json
installermarker materialize installermarker.json --dry-run
```

Materialize into a new or collision-free directory:

```bash
installermarker materialize installermarker.json --output-dir artifacts/v1
installermarker materialize installermarker.json --target linux-x64 --output-dir artifacts/linux
```

The worker processes only targets whose packaging strategy is `reuse-installer`. Other targets are recorded as skipped. Pass `--target windows-x64`, `--target macos-universal`, or `--target linux-x64` to materialize just one reusable installer; omit it to process all reusable targets. Each selected asset must have a GitHub-published SHA-256 digest, be at most one GiB, use a platform-compatible installer extension, and originate from the source repository's public GitHub Releases. It retries transient connection failures, rate limits, and server errors up to two times before failing; every successful response still receives the same source, size, and SHA-256 checks. Private asset authentication is not supported yet.

`validate` is the review gate: it checks the published JSON Schema and materialization policy without downloading files. The CLI accepts `.json`, `.yaml`, and `.yml` recipe files. `validate --strict` treats unresolved review warnings as failures, which is useful for repositories that require a fully resolved recipe before automation.

The output directory contains the verified installers and `artifacts.json`. Existing files are never overwritten. The manifest includes the source repository, commit, and available SPDX license evidence, along with the target platform, filename, verified byte size and SHA-256, and original GitHub URL. Its contract is defined in `schema/artifact-manifest.schema.json`.
