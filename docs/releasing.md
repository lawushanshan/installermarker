# Releasing

1. Ensure `main` is green and review the generated release notes.
2. Update `package.json` using semantic versioning and commit the change.
3. Create an annotated tag matching the package version exactly, for example `v0.2.0`.
4. Push the commit and tag. The protected `release` environment must approve the workflow.
5. Verify the GitHub Release contains the `.tgz` artifact and, when npm publishing is enabled, verify the npm package metadata.

The release workflow refuses tags that do not match `package.json`. GitHub Release publication needs only the scoped `GITHUB_TOKEN`; npm publication is skipped until an `NPM_TOKEN` repository secret is configured. When publishing, npm provenance is generated through the workflow's `id-token: write` permission so consumers can verify the package build origin.
