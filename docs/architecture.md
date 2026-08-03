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

The source-build worker is an explicit exception to the no-execution rule: it requires a reviewed command and an acknowledgement flag, verifies the native host target, clones the public source at its pinned commit, runs with an isolated home and no inherited credential variables, and collects only platform-compatible installer files from reviewed directories. When the reviewed build emits common SPDX or CycloneDX SBOM documents in those directories, the worker copies and hashes them as build SBOM evidence; it does not generate or enrich them. Electron/Tauri manifests can surface structured packager and command hints when they name Electron Builder, Electron Forge, or Tauri CLI, and Python manifests do the same for Briefcase, PyInstaller, Nuitka, or cx_Freeze, but the reviewer still must confirm the final command. Go/Rust native packaging commands must be selected by the reviewer. Hosted GitHub Actions runs belong behind the protected `source-build` environment.

The materialization worker is intentionally narrower. It validates source ownership, platform-specific installer extensions, declared size, a one-GiB per-file limit, HTTPS redirect ownership, and SHA-256. Downloads remain in a random staging directory until every selected artifact passes verification. It refuses output collisions and emits `artifacts.json`, described by `schema/artifact-manifest.schema.json`.

The current CLI also exposes read-only projections and result verifiers over verified artifact directories. `sbom` derives a machine-readable component inventory from the manifest, `smoke-plan` derives an install/launch/uninstall checklist for each installer, `smoke-verify` validates an external isolated smoke-runner result against the verified artifact hashes and generated smoke plan, `sign-plan` derives signing requests for a separately protected signing service, `sign-verify` validates an external protected signing-service result against the verified artifact hashes and generated signing plan, `scan-plan` derives malware/reputation/SBOM-correlation scan requests, `scan-verify` validates an externally produced approved-scanner result against verified artifact hashes, and `release-plan` composes those gates into one reviewable release payload. `release-verify` re-verifies local artifacts and aggregates raw external smoke, scan, and signing results into a final release evidence report without trusting precomputed verification reports. `publish-plan` turns valid final release evidence into a draft release asset checklist without contacting release services, and `publish-verify` validates a protected release service's raw result against that regenerated plan without contacting GitHub Releases. `gate-verify` validates that a CI-generated release-gate JSON bundle is complete and internally consistent. These commands do not execute artifacts, upload samples, contact scanner services, publish releases, or access signing credentials.

Hosted GitHub Actions workflows mirror these boundaries: materialization, release-gate planning, release-evidence verification, publish-plan generation, and publish-result verification run with read-only repository permissions and without repository secrets. They exchange short-lived GitHub Actions artifacts, not signing credentials or release-service authority.

## Target policy

The analyzer recognizes a release package as direct evidence. In its absence, Go, Rust, Electron, and Tauri are marked `likely` because they conventionally have cross-platform compilation paths. This is deliberately not treated as proof of support. Other detected families are `needs_review` until an explicit packager and runtime policy are selected.
