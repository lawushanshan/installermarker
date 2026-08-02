# GitHub Actions materialization worker

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

The workflow downloads that GitHub Actions artifact, runs `verify`, `sbom`, `smoke-plan`, `scan-plan`, `sign-plan`, and `release-plan`, then uploads the resulting JSON files as `release-gate-plans-<run_id>`.

This workflow has only `actions: read` and `contents: read` permissions. It uses no repository secrets, does not run installers, does not run smoke tests, does not invoke scanners, does not sign or notarize artifacts, and does not publish releases. Treat its output as the review bundle that must pass before any later protected scanner, signing, notarization, or publication service is allowed to consume the verified installers.
