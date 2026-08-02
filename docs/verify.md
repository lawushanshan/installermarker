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

Use `installermarker smoke-verify artifacts/linux --result smoke-result.json --format json` after a separately isolated smoke runner returns a result file. The command re-verifies the local artifact directory, validates the smoke-result contract, and checks that the runner's source, manifest, artifact hashes, installer types, target hosts, step names, step statuses, and summary verdicts match the generated smoke plan. It does not install, launch, uninstall, or execute artifacts.

Use `installermarker sign-plan artifacts/linux --format json` to generate plan-only signing requests for a protected signing service. It records the expected signing profile and stages, but never accesses credentials or invokes signing tools.

Use `installermarker sign-verify artifacts/linux --result sign-result.json --format json` after a protected signing service returns a result file. The command re-verifies the local artifact directory, validates the signing-result contract, and checks that the signer's source, manifest, artifact hashes, signing profiles, stage names, stage statuses, and summary verdicts match the generated signing plan. It does not access credentials, sign artifacts, notarize packages, or publish releases.

Use `installermarker scan-plan artifacts/linux --format json` to generate plan-only malware, reputation, and SBOM-correlation scan requests. It records what should be scanned later, but does not upload artifacts or invoke scanners.

Use `installermarker scan-verify artifacts/linux --result scan-result.json --format json` after a separately approved scanner returns a result file. The command re-verifies the local artifact directory, validates the scanner-result contract, and checks that the scanner's source, manifest, artifact hashes, stage statuses, and summary verdicts match the verified artifacts. It does not upload artifacts or invoke scanners.

Use `installermarker release-plan artifacts/linux --format json` to generate a single plan-only release gate. It verifies local artifact integrity first, then composes the SBOM, smoke-test, scan, and signing plans into one reviewable payload. It does not execute artifacts, run smoke tests, invoke scanners, sign artifacts, notarize packages, or publish releases.

Use `installermarker release-verify artifacts/linux --smoke-result smoke-result.json --scan-result scan-result.json --sign-result sign-result.json --format json` after external smoke, scan, and signing services return their raw result files. The command re-verifies the local artifact directory, reruns all three result verifiers locally, and emits one final release evidence report. It does not trust precomputed verification reports and still does not execute artifacts, invoke scanners, sign artifacts, notarize packages, or publish releases.

Use `installermarker gate-verify release-gate-plans --format json` to validate a CI-generated release-gate bundle. It checks that the standalone JSON files and the embedded plans in `release-plan.json` agree with `verify.json`.
