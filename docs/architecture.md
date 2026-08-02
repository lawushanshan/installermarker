# Architecture

InstallerMarker separates discovery from execution.

```text
GitHub URL -> read-only inspection -> assessment + recipe -> reviewed build request
                                                    -> isolated target workers -> signing -> release
```

The current CLI implements read-only discovery, pinned recipes, a restricted materialization worker for existing installers, and source-build workers for Electron, Tauri, and reviewer-configured Go/Rust/Python native packaging. Discovery resolves the default branch to an immutable commit, then uses the GitHub REST API to retrieve the pinned tree, an allowlist of root-level manifests, declared dependency inventory from supported manifests, lockfile presence from the tree, a small dependency risk scan, and the latest release. Materialization can download digest-pinned installers from that repository's public GitHub Releases, but no artifact or target-repository instruction is executed as a command.

## Recipe contract

A recipe is generated as JSON or YAML and is intended to be committed alongside packaging configuration. It records the source repository and commit SHA, selected release-asset provenance, proposed build strategy, target statuses, and review items. It is a draft, not a build authorization. The machine-readable JSON contract is stored in `schema/installermarker.schema.json`.

Future workers must require a reviewed recipe and verify its pinned commit and input digests. They should build each target in an ephemeral environment, capture build provenance and an SBOM, execute install/uninstall smoke tests, and submit only final artifacts to a separately protected signing service.

The source-build worker is an explicit exception to the no-execution rule: it requires a reviewed command and an acknowledgement flag, verifies the native host target, clones the public source at its pinned commit, runs with an isolated home and no inherited credential variables, and collects only platform-compatible installer files from reviewed directories. When the reviewed build emits common SPDX or CycloneDX SBOM documents in those directories, the worker copies and hashes them as build SBOM evidence; it does not generate or enrich them. Electron/Tauri commands may be suggested; Go/Rust/Python native packaging commands must be selected by the reviewer. Hosted GitHub Actions runs belong behind the protected `source-build` environment.

The materialization worker is intentionally narrower. It validates source ownership, platform-specific installer extensions, declared size, a one-GiB per-file limit, HTTPS redirect ownership, and SHA-256. Downloads remain in a random staging directory until every selected artifact passes verification. It refuses output collisions and emits `artifacts.json`, described by `schema/artifact-manifest.schema.json`.

The current CLI also exposes read-only projections over verified artifact directories. `sbom` derives a machine-readable component inventory from the manifest, `smoke-plan` derives an install/launch/uninstall checklist for each installer, `sign-plan` derives signing requests for a separately protected signing service, `scan-plan` derives malware/reputation/SBOM-correlation scan requests, and `release-plan` composes those gates into one reviewable release payload. These commands do not execute artifacts, upload samples, contact scanner services, publish releases, or access signing credentials.

## Target policy

The analyzer recognizes a release package as direct evidence. In its absence, Go, Rust, Electron, and Tauri are marked `likely` because they conventionally have cross-platform compilation paths. This is deliberately not treated as proof of support. Other detected families are `needs_review` until an explicit packager and runtime policy are selected.
