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
  const lines = [
    `${report.application.name} (${report.source.url})`,
    `Project type: ${report.analysis.project.kind} (${report.analysis.project.evidence})`,
    `Confidence: ${report.analysis.confidence}`,
    `License: ${report.source.license}`,
    `Commit: ${report.source.commitSha}`,
    "",
    "Target assessment:"
  ];
  for (const target of report.targets) lines.push(`  ${target.label}: ${target.status} - ${target.reason}`);
  lines.push("", `Safety: ${report.analysis.safety}`);
  return lines.join("\n");
}
import { createRecipe } from "./recipe.js";
