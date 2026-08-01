# Security policy

## Threat model

Repositories submitted to InstallerMarker are untrusted. Their source, README, build configuration, release assets, and dependencies can be malicious. The analyzer must remain read-only and must not execute project code.

Future build workers must be ephemeral, isolated per job, have no access to developer workstations or CI secrets, and have constrained network access. Artifact signing and macOS notarization must run in a separate protected environment after builds are complete.

The current materialization worker does not execute or install artifacts. It accepts only digest-pinned assets from the source repository's public GitHub Releases, verifies streamed bytes before publishing them, and refuses to overwrite existing output. Passing checksum verification establishes integrity against the recipe; it does not establish that an installer is benign.

The repository-owned GitHub Actions materialization workflow uses `contents: read`, does not persist checkout credentials, and takes its recipe only from the checked-out control repository. Protect recipe changes and workflow dispatch permissions accordingly.

The Scorecard workflow runs with read-only repository access plus only the `security-events` and OIDC permissions needed to publish SARIF findings and Scorecard results. It disables checkout credential persistence and does not receive repository secrets.

The source-build workflow runs explicitly reviewed repository code. It uses a protected environment, ephemeral hosted runners, `contents: read`, disabled checkout credential persistence, an isolated home, and a reduced environment passed to the target command. It does not make source builds safe for arbitrary unreviewed code; do not attach signing credentials, deployment tokens, or production secrets to the `source-build` environment.

## Reporting a vulnerability

Do not open a public issue for a suspected vulnerability. Use [GitHub's private vulnerability reporting form](https://github.com/lawushanshan/installermarker/security/advisories/new) instead.
