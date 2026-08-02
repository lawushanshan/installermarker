import { assertVerifiedArtifactDirectory, artifactProjection, manifestProjection } from "./projection.js";

const INSTALLER_TYPES = [
  { type: "msi", pattern: /\.msi$/i, runOn: "windows-x64" },
  { type: "exe", pattern: /\.exe$/i, runOn: "windows-x64" },
  { type: "dmg", pattern: /\.dmg$/i, runOn: "macos-universal" },
  { type: "pkg", pattern: /\.pkg$/i, runOn: "macos-universal" },
  { type: "appimage", pattern: /\.appimage$/i, runOn: "linux-x64" },
  { type: "deb", pattern: /\.deb$/i, runOn: "linux-x64" },
  { type: "rpm", pattern: /\.rpm$/i, runOn: "linux-x64" }
];

function installerType(name) {
  const match = INSTALLER_TYPES.find((item) => item.pattern.test(name));
  if (!match) throw new Error(`Unsupported installer type for smoke testing: ${name}`);
  return match;
}

function sharedSteps() {
  return [
    {
      name: "prepare-isolated-host",
      mode: "manual",
      description: "Use a disposable VM or runner snapshot with no signing credentials or user data."
    },
    {
      name: "install",
      mode: "manual",
      description: "Install the artifact with the platform-native installer flow after reviewing any required elevation or silent-install flags."
    },
    {
      name: "launch",
      mode: "manual",
      description: "Launch the reviewed application entrypoint and confirm the process starts without installer-time network or credential prompts."
    },
    {
      name: "uninstall",
      mode: "manual",
      description: "Uninstall through the platform-native removal path and confirm the application entrypoint is no longer present."
    }
  ];
}

function typeNotes(type) {
  if (type === "exe") return ["Review vendor-specific silent install and uninstall flags before automation."];
  if (type === "dmg") return ["Mount the image in an isolated macOS host; review whether it contains an app bundle or installer package."];
  if (type === "appimage") return ["Run without installing system packages; removal should be file deletion plus any reviewed desktop integration cleanup."];
  if (type === "deb" || type === "rpm") return ["Confirm the package identity before uninstall automation."];
  return [];
}

export function createSmokePlan(verification, { generatedAt = new Date().toISOString() } = {}) {
  assertVerifiedArtifactDirectory(verification);
  const tests = verification.artifacts.map((artifact) => {
    const type = installerType(artifact.name);
    if (artifact.platform !== type.runOn) {
      throw new Error(`Artifact ${artifact.name} does not match its platform smoke-test host.`);
    }
    return {
      artifact: artifactProjection(artifact),
      installerType: type.type,
      runOn: type.runOn,
      steps: sharedSteps(),
      notes: typeNotes(type.type)
    };
  });
  return {
    schemaVersion: 1,
    generatedAt,
    source: verification.source,
    manifest: manifestProjection(verification),
    execution: {
      mode: "plan-only",
      safety: "This plan does not execute, install, launch, or uninstall artifacts."
    },
    tests
  };
}

export function formatSmokePlan(plan, format = "text") {
  if (format === "json") return JSON.stringify(plan, null, 2);
  const lines = [
    `Smoke test plan for ${plan.source.repository}@${plan.source.commit}`,
    `Manifest: ${plan.manifest.name}`,
    `Generated: ${plan.generatedAt}`,
    `Execution: ${plan.execution.mode}`,
    `Safety: ${plan.execution.safety}`,
    `Tests: ${plan.tests.length}`
  ];
  for (const test of plan.tests) {
    lines.push(`- ${test.artifact.platform} ${test.artifact.name} (${test.installerType}) on ${test.runOn}`);
    for (const step of test.steps) lines.push(`  ${step.name}: ${step.description}`);
    for (const note of test.notes) lines.push(`  note: ${note}`);
  }
  return lines.join("\n");
}
