# GitHub Actions materialization worker

InstallerMarker includes a manually triggered workflow at `.github/workflows/materialize.yml`. Keep reviewed JSON or YAML recipes in the InstallerMarker control repository, then open **Actions**, select **Materialize Verified Installers**, and provide the committed recipe path.

The workflow:

1. Checks out only the control repository with credentials disabled after checkout.
2. Validates the recipe contract.
3. Downloads only digest-pinned installer assets from the configured source repository.
4. Uploads the verified files and `artifacts.json` as a short-lived GitHub Actions artifact.

It has `contents: read` permission only, uses no repository secrets, does not check out the target repository, and does not execute or install downloaded files. The workflow passes `--recipe-root "$GITHUB_WORKSPACE"`, so a dispatch input cannot select a recipe outside the checked-out control repository, including through a symlink. A workflow run that has a recipe with unresolved source-build fields may still materialize existing installers; source builds are deliberately not implemented in this workflow.

Before enabling this workflow, protect the default branch and restrict who can trigger workflows. Review every recipe change as code, because it selects external download URLs within the validated GitHub Release policy.