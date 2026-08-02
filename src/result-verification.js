export function diagnostic(severity, code, path, message) {
  return { severity, code, path, message };
}

export function check(name, passed, message) {
  return { name, status: passed ? "passed" : "failed", message };
}

export function addCheck(checks, diagnostics, name, passed, message, code, path) {
  checks.push(check(name, passed, message));
  if (!passed) diagnostics.push(diagnostic("error", code, path, message));
}

export function sourceKey(source) {
  return `${source.repository}@${source.commit}`;
}

export function artifactKey(artifact) {
  return `${artifact.platform}\0${artifact.name}\0${artifact.size}\0${artifact.sha256}`;
}

export function sameArtifactSet(left, right) {
  if (left.length !== right.length) return false;
  const leftKeys = left.map(artifactKey).sort();
  const rightKeys = right.map(artifactKey).sort();
  return leftKeys.every((key, index) => key === rightKeys[index]);
}

export function actualSummary(results) {
  const summary = { passed: 0, failed: 0, inconclusive: 0 };
  for (const result of results) summary[result.verdict] += 1;
  return {
    verdict: summary.failed > 0 ? "failed" : summary.inconclusive > 0 ? "inconclusive" : "passed",
    ...summary
  };
}

export function summaryMatches(actual, declared) {
  return actual.verdict === declared.verdict
    && actual.passed === declared.passed
    && actual.failed === declared.failed
    && actual.inconclusive === declared.inconclusive;
}
