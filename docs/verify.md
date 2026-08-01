# Verifying local installer artifacts

Use `verify` after copying, archiving, or transferring an InstallerMarker artifact directory:

```bash
installermarker verify artifacts/linux
installermarker verify artifacts/linux --format json
```

The directory must contain exactly one supported manifest: `artifacts.json` from `materialize`, or `build-artifacts.json` from `build`. The command validates its schema, rejects symbolic links and unsafe filenames, then recomputes the size and SHA-256 for every listed installer. It does not execute, mount, or install any artifact.

Verification checks integrity against the manifest. It does not prove an installer is benign or grant redistribution rights; review the recorded source and license evidence before publishing.