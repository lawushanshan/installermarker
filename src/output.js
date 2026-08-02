function yamlValue(value) {
  if (value === null || value === undefined || value === "") return "''";
  if (typeof value === "boolean" || typeof value === "number") return String(value);
  return JSON.stringify(String(value));
}

function yamlLines(value, indentation = "") {
  if (Array.isArray(value)) {
    if (value.length === 0) return [`${indentation}[]`];
    return value.flatMap((item) => {
      if (typeof item === "object" && item !== null) return [`${indentation}-`, ...yamlLines(item, `${indentation}  `)];
      return [`${indentation}- ${yamlValue(item)}`];
    });
  }
  const entries = Object.entries(value);
  if (entries.length === 0) return [`${indentation}{}`];
  return entries.flatMap(([key, item]) => {
    if (item && typeof item === "object") return [`${indentation}${key}:`, ...yamlLines(item, `${indentation}  `)];
    return [`${indentation}${key}: ${yamlValue(item)}`];
  });
}

export function toYaml(value) {
  return `${yamlLines(value).join("\n")}\n`;
}

export function formatRecipe(report, format) {
  const recipe = createRecipe(report);
  return format === "json" ? JSON.stringify(recipe, null, 2) : toYaml(recipe);
}

export function formatReport(report, format) {
  if (format === "json") return JSON.stringify(report, null, 2);
  if (format === "yaml") return toYaml(report);
  const dependencyInventory = report.analysis.dependencies;
  const dependencyRisks = report.analysis.dependencyRisks;
  const dependencySummary = dependencyInventory?.manifestCount
    ? `Dependency inventory: ${dependencyInventory.manifestCount} manifest(s), ${dependencyInventory.dependencyCount} declared dependency(s)`
    : "Dependency inventory: none detected";
  const lockfileSummary = dependencyInventory?.lockfileCount
    ? `Dependency locks: ${dependencyInventory.lockfileCount} lockfile(s) detected`
    : "Dependency locks: none detected";
  const riskSummary = dependencyRisks?.findingCount
    ? `Dependency scan: ${dependencyRisks.findingCount} finding(s) [high ${dependencyRisks.severityCounts.high ?? 0}, medium ${dependencyRisks.severityCounts.medium ?? 0}]`
    : "Dependency scan: no obvious high-risk references detected";
  const lines = [
    `${report.application.name} (${report.source.url})`,
    `Project type: ${report.analysis.project.kind} (${report.analysis.project.evidence})`,
    `Confidence: ${report.analysis.confidence}`,
    `License: ${report.source.license}`,
    `Commit: ${report.source.commitSha}`,
    dependencySummary,
    lockfileSummary,
    riskSummary,
    "",
    "Target assessment:"
  ];
  if (dependencyInventory?.manifests?.length) {
    for (const manifest of dependencyInventory.manifests) {
      const scopes = Object.entries(manifest.scopes)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([scope, count]) => `${scope} ${count}`)
        .join(", ");
      const packageName = manifest.packageName ? ` (${manifest.packageName})` : "";
      const lockfiles = manifest.lockfiles?.length ? `; locked by ${manifest.lockfiles.map((item) => item.path).join(", ")}` : "; no lockfile detected";
      lines.push(`  ${manifest.path}${packageName}: ${manifest.kind}${scopes ? ` (${scopes})` : ""}${lockfiles}`);
    }
    if (dependencyInventory.skipped?.length) {
      lines.push(`  Skipped: ${dependencyInventory.skipped.map((item) => item.path).join(", ")}`);
    }
  }
  if (dependencyRisks?.findings?.length) {
    for (const finding of dependencyRisks.findings) {
      lines.push(`  ${finding.severity.toUpperCase()} ${finding.path} [${finding.code}]: ${finding.message}`);
    }
  }
  for (const target of report.targets) lines.push(`  ${target.label}: ${target.status} - ${target.reason}`);
  lines.push("", `Safety: ${report.analysis.safety}`);
  return lines.join("\n");
}
import { createRecipe } from "./recipe.js";
