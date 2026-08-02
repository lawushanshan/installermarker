# Verifying local installer artifacts

Use `verify` after copying, archiving, or transferring an InstallerMarker artifact directory:

```bash
installermarker verify artifacts/linux
installermarker verify artifacts/linux --format json
```

The directory must contain exactly one supported manifest: `artifacts.json` from `materialize`, or `build-artifacts.json` from `build`. The command validates its schema, rejects symbolic links and unsafe filenames, then recomputes the size and SHA-256 for every listed installer and any build-produced SBOM documents recorded in the manifest. It does not execute, mount, or install any artifact.

Verification checks integrity against the manifest. It does not prove an installer is benign or grant redistribution rights; review the recorded source and license evidence before publishing.

Use `installermarker sbom artifacts/linux --format json` to project a verified manifest into a read-only component inventory. For source-build outputs, it also carries forward any verified build-produced SBOM documents as evidence. That command stays offline and never executes any artifact.

Use `installermarker smoke-plan artifacts/linux --format json` to generate a plan-only install/launch/uninstall checklist for each verified installer. It does not execute the checklist; run it only later in an isolated native host.

Use `installermarker sign-plan artifacts/linux --format json` to generate plan-only signing requests for a protected signing service. It records the expected signing profile and stages, but never accesses credentials or invokes signing tools.

Use `installermarker scan-plan artifacts/linux --format json` to generate plan-only malware, reputation, and SBOM-correlation scan requests. It records what should be scanned later, but does not upload artifacts or invoke scanners.

Use `installermarker release-plan artifacts/linux --format json` to generate a single plan-only release gate. It verifies local artifact integrity first, then composes the SBOM, smoke-test, scan, and signing plans into one reviewable payload. It does not execute artifacts, run smoke tests, invoke scanners, sign artifacts, notarize packages, or publish releases.

Use `installermarker gate-verify release-gate-plans --format json` to validate a CI-generated release-gate bundle. It checks that the standalone JSON files and the embedded plans in `release-plan.json` agree with `verify.json`.
