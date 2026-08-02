function targetRecipe(target, project) {
  const recipe = {
    platform: target.id,
    status: target.status,
    packaging: target.artifact === "installer"
      ? "reuse-installer"
      : target.artifact === "release-asset"
        ? "wrap-release-asset"
        : project.kind === "electron" && target.status === "likely"
          ? "build-electron"
        : project.kind === "tauri" && target.status === "likely"
          ? "build-tauri"
        : ["go", "rust", "python"].includes(project.kind) && target.status === "likely"
          ? "build-native"
        : "TODO: select packager"
  };

  if (target.selectedAsset) recipe.input = { ...target.selectedAsset };
  return recipe;
}

export function createRecipe(report) {
  const project = report.analysis.project;
  const targets = report.targets.map((target) => targetRecipe(target, project));
  const license = report.source.license ?? "NOASSERTION";
  const review = [
    license === "NOASSERTION" ? "Source license was not detected; obtain redistribution permission before packaging." : "Confirm license permits redistribution.",
    "Confirm the entrypoint and persistent data directory.",
    "Run builds in isolated CI workers before signing."
  ];
  if (project.suggestedBuildCommand) {
    review.push(project.suggestedPackager
      ? `Review the suggested ${project.suggestedPackager} build command before copying it into build.command.`
      : "Review the suggested build command before copying it into build.command.");
  }
  if (targets.some((target) => target.input && !target.input.digest)) {
    review.push("Calculate and verify SHA-256 for release assets that do not publish a digest.");
  }

  return {
    schemaVersion: 1,
    source: {
      repository: report.source.url,
      branch: report.source.defaultBranch,
      commit: report.source.commitSha,
      license
    },
    application: {
      name: report.application.name,
      entrypoint: "TODO: confirm executable entrypoint"
    },
    build: {
      strategy: project.strategy,
      command: "TODO: confirm reproducible build command",
      artifactDirectories: project.artifactDirectories ?? [],
      ...(project.suggestedPackager ? { suggestedPackager: project.suggestedPackager } : {}),
      ...(project.suggestedBuildCommand ? { suggestedCommand: project.suggestedBuildCommand } : {})
    },
    targets,
    review
  };
}
