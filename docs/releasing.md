# Releasing

1. Ensure `main` is green and review the generated release notes.
2. Update `package.json` using semantic versioning and commit the change.
3. Create an annotated tag matching the package version exactly, for example `v0.2.0`.
4. Push the commit and tag. The protected `release` environment must approve the workflow.
5. Verify the GitHub Release contains the `.tgz` artifact and, when npm publishing is enabled, verify the npm package metadata.

The release workflow refuses tags that do not match `package.json`. GitHub Release publication needs only the scoped `GITHUB_TOKEN`; npm publication is skipped until an `NPM_TOKEN` repository secret is configured. When publishing, npm provenance is generated through the workflow's `id-token: write` permission so consumers can verify the package build origin.

## Installer artifact publish plans

For repackaged installer artifacts, do not publish directly from build, smoke-test, scanner, or signing workers. After `release-verify` produces a valid `release-verification.json`, run:

```bash
installermarker publish-plan artifacts/linux --release-verification release-verification.json --release-tag v1.0.0 --format json > publish-plan.json
```

The plan validates that the final evidence belongs to the verified artifact directory and lists the exact installer assets, required SHA-256 hashes, supplemental evidence files and their SHA-256 hashes, and manual publication checks. It is still plan-only: it does not upload files, create a GitHub Release, publish packages, sign artifacts, notarize packages, or contact external services.

For repository-managed runs, `.github/workflows/publish-plan.yml` performs the same plan generation from two uploaded GitHub Actions artifacts: the verified artifact directory and `release-verification.json`. It uses only `actions: read` and `contents: read`, uploads `publish-plan.json` as a short-lived artifact, and still does not create a release or publish packages.

If a separately reviewed protected release service consumes `publish-plan.json`, require it to return a raw `publish-result.json`. Verify that result before considering the release handoff complete:

```bash
installermarker publish-verify artifacts/linux --release-verification release-verification.json --release-tag v1.0.0 --result publish-result.json --format json > publish-verification.json
```

The verifier rebuilds the publish plan locally and checks the protected service's reported release tag, draft state, URL, asset names, asset types, hashes, and summary verdicts. It does not query GitHub Releases or publish anything.
