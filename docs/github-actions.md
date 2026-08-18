# GitHub Actions workers

InstallerMarker includes a manually triggered workflow at `.github/workflows/materialize.yml`. Keep reviewed JSON or YAML recipes in the InstallerMarker control repository, then open **Actions**, select **Materialize Verified Installers**, and provide the committed recipe path.

The workflow:

1. Checks out only the control repository with credentials disabled after checkout.
2. Validates the recipe contract.
3. Downloads only digest-pinned installer assets from the configured source repository.
4. Uploads the verified files and `artifacts.json` as a short-lived GitHub Actions artifact.

It has `contents: read` permission only, uses no repository secrets, does not check out the target repository, and does not execute or install downloaded files. The workflow passes `--recipe-root "$GITHUB_WORKSPACE"`, so a dispatch input cannot select a recipe outside the checked-out control repository, including through a symlink. A workflow run that has a recipe with unresolved source-build fields may still materialize existing installers; source builds are deliberately not implemented in this workflow.

Before enabling this workflow, protect the default branch and restrict who can trigger workflows. Review every recipe change as code, because it selects external download URLs within the validated GitHub Release policy.

## Release gate plan

After a materialization or source-build workflow uploads a verified artifact directory, use `.github/workflows/release-gate.yml` to compose the review payload for the next release decision. Open **Actions**, select **Release Gate Plan**, and provide:

- `source_run_id`: the workflow run ID that produced the verified artifact directory.
- `artifact_name`: the uploaded artifact name, such as `verified-installers-<run_id>` or `built-installers-linux-<run_id>`.

The workflow downloads that GitHub Actions artifact, runs `verify`, `sbom`, `smoke-plan`, `scan-plan`, `sign-plan`, `release-plan`, and `gate-verify`, then uploads the resulting JSON files as `release-gate-plans-<run_id>`. The `gate-verification.json` file is a machine-readable consistency report for the bundle itself; it fails the workflow if any required JSON file is missing or contradicts `verify.json`.

This workflow has only `actions: read` and `contents: read` permissions. It uses no repository secrets, does not run installers, does not run smoke tests, does not invoke scanners, does not sign or notarize artifacts, and does not publish releases. Treat its output as the review bundle that must pass before any later protected scanner, signing, notarization, or publication service is allowed to consume the verified installers.

## Release evidence verification

After external isolated smoke, approved scanning, and protected signing services upload their raw result files, use `.github/workflows/release-verify.yml` to aggregate the final release evidence. Open **Actions**, select **Release Evidence Verification**, and provide:

- `source_run_id`: the workflow run ID that produced the verified artifact directory.
- `artifact_name`: the uploaded artifact name containing `artifacts.json` or `build-artifacts.json` plus installers.
- `evidence_run_id`: the workflow run ID that uploaded the raw external result files.
- `evidence_artifact_name`: the uploaded artifact name containing `smoke-result.json`, `scan-result.json`, and `sign-result.json` at its root.

The workflow downloads both artifacts, runs `release-verify`, and uploads `release-verification.json` as `release-verification-<run_id>`. The command re-verifies local artifact hashes and reruns smoke, scan, and signing result verification from the raw external files; it does not trust precomputed verification reports.

This workflow also has only `actions: read` and `contents: read` permissions. It uses no repository secrets, does not run installers, does not invoke scanners, does not access signing credentials, does not sign or notarize artifacts, and does not publish releases.

## Installer artifact publish plan

After `release-verify` uploads a valid final evidence report, use `.github/workflows/publish-plan.yml` to generate the draft publication checklist. Open **Actions**, select **Installer Artifact Publish Plan**, and provide:

- `source_run_id`: the workflow run ID that produced the verified artifact directory.
- `artifact_name`: the uploaded artifact name containing `artifacts.json` or `build-artifacts.json` plus installers.
- `verification_run_id`: the workflow run ID that uploaded `release-verification.json`.
- `verification_artifact_name`: the uploaded artifact name containing `release-verification.json`.
- `release_tag`: the draft release tag to record in `publish-plan.json`, such as `v1.0.0`.

The workflow downloads both artifacts, runs `publish-plan`, and uploads `publish-plan.json` as `publish-plan-<run_id>`. The command re-verifies the local artifact directory, validates the final release evidence contract, checks that the evidence belongs to the same source and manifest, and records the exact installer and supplemental evidence names plus SHA-256 hashes reviewers must preserve during publication.

This workflow has only `actions: read` and `contents: read` permissions. It uses no repository secrets, does not run installers, does not invoke scanners, does not access signing credentials, does not sign or notarize artifacts, does not create a GitHub Release, and does not publish packages. Treat its output as a manual publication checklist or as input to a separately reviewed protected release service.

If such a protected release service uploads a raw `publish-result.json`, verify it with `publish-verify` before treating the publication handoff as complete. The verifier uses the same verified artifact directory, final release evidence, and intended release tag to check the returned asset set without querying GitHub Releases.

For repository-managed verification, use `.github/workflows/publish-verify.yml`. Open **Actions**, select **Installer Artifact Publish Verification**, and provide:

- `source_run_id`: the workflow run ID that produced the verified artifact directory.
- `artifact_name`: the uploaded artifact name containing `artifacts.json` or `build-artifacts.json` plus installers.
- `verification_run_id`: the workflow run ID that uploaded `release-verification.json`.
- `verification_artifact_name`: the uploaded artifact name containing `release-verification.json`.
- `result_run_id`: the workflow run ID that uploaded `publish-result.json`.
- `result_artifact_name`: the uploaded artifact name containing `publish-result.json`.
- `release_tag`: the expected release tag to verify, such as `v1.0.0`.

The workflow downloads all three artifacts, runs `publish-verify`, and uploads `publish-verification.json` as `publish-verification-<run_id>`. It has only `actions: read` and `contents: read` permissions, uses no repository secrets, does not run installers, does not query GitHub Releases, does not create a release, and does not publish packages.
