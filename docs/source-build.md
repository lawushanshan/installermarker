# Building local installers from source

InstallerMarker can build reviewed Electron and Tauri projects into native local-installation packages. It also creates a `build-native` path for Go, Rust, and Python projects: the reviewer must choose the native packager and resulting installer directory. This path is intentionally separate from `materialize`: it executes source code and dependencies, so it must run in an ephemeral, secret-free environment.

## Prepare a recipe

Inspect the repository and produce a JSON or YAML recipe. For Electron and Tauri, InstallerMarker proposes source-build targets, artifact directories, and often a suggested command. Go, Rust, and Python projects receive `build-native`; add the reviewed command and installer directory for the selected native packaging tool. Review and edit the recipe before execution:

```json
{
  "build": {
    "strategy": "electron",
    "command": "npm ci && npm run dist",
    "artifactDirectories": ["dist", "out"]
  },
  "targets": [
    { "platform": "windows-x64", "status": "likely", "packaging": "build-electron" }
  ]
}
```

Run `installermarker validate recipe.json`. The source-build status must be `ready`. A source build command is a security boundary: do not copy a suggestion into `build.command` until it has been reviewed for that repository and pinned commit.

For `build-native`, use `build.strategy: go-native`, `rust-native`, or `python-native`, retain `packaging: build-native`, and configure a command that produces a platform installer in `artifactDirectories`. Python detection defaults to `dist` and `build`, but does not guess an entrypoint or packaging command. The reviewer must select and audit a tool such as PyInstaller, Briefcase, or Nuitka for the pinned source revision. The Worker deliberately does not select a packager on the reviewer's behalf: Windows, macOS, and Linux packaging tools have different trust and signing requirements.

## Local execution

Run each target only on its matching operating system. The acknowledgement flag is mandatory because the command runs code from the target repository.

```bash
installermarker build recipe.json \
  --target linux-x64 \
  --workspace /safe-temporary-directory/source \
  --output-dir artifacts/linux \
  --allow-unsafe-local-build
```

The workspace must not already exist. InstallerMarker clones the public GitHub source at the reviewed commit, disables system Git configuration and hooks before cloning, uses an isolated home and npm configuration, runs the reviewed command, collects only platform-compatible installer files, hashes them, and writes `build-artifacts.json`. Artifact directories must be real directories inside the checkout, not symbolic links; each installer is limited to one GiB. It never overwrites an existing output file. The checkout remains available for build-log inspection; delete it only after reviewing the result.

## GitHub Actions

Use `.github/workflows/build.yml` in the InstallerMarker control repository. It runs the requested target on native Windows, macOS, or Linux hosted runners and uploads the verified packages as workflow artifacts. Create a protected `source-build` environment with required reviewers before using it. The workflow checks out only the control repository, then the Worker clones the target source at its commit with no credentials retained.

The Worker recognizes Windows `.msi`/`.exe`, macOS `.dmg`/`.pkg`, and Linux `.AppImage`/`.deb`/`.rpm`. It does not sign or notarize packages. Signing must be a later, isolated approval stage.