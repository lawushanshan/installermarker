# Contributing

## Development

Use Node.js 20 or newer.

```bash
npm test
npm run check
npm run pack:dry-run
```

Keep detectors deterministic. An analysis result must identify the concrete repository evidence that produced it, and it must distinguish facts from recommendations. Do not add behavior that executes source code from the inspected repository.

Recipe contract changes require updating `schema/installermarker.schema.json` and adding a compatibility test. Existing schema versions must remain readable or receive an explicit migration path.

## Pull requests

Use a focused change, include tests for new detection behavior, and update documentation when a supported project family or target policy changes. Maintainers should require CI before merge and use squash merges with conventional commit subjects.

## Releases

Use semantic versions and create annotated version tags. The release workflow attaches the packed CLI artifact to GitHub Releases. Publishing to npm is only performed when `NPM_TOKEN` has been configured and the workflow has explicit approval.