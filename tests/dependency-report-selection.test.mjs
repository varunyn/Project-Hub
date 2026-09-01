import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function loadSelectionModule() {
  const outDir = mkdtempSync(path.join(tmpdir(), "project-hub-report-selection-tsc-"));
  try {
    execFileSync(
      "pnpm",
      [
        "exec",
        "tsc",
        "--ignoreConfig",
        "app/lib/dependencyReportSelection.ts",
        "--outDir",
        outDir,
        "--module",
        "Node16",
        "--target",
        "es2022",
        "--skipLibCheck",
        "--moduleResolution",
        "node16",
        "--types",
        "node",
      ],
      { cwd: projectRoot, stdio: "pipe" }
    );
    return require(path.join(outDir, "dependencyReportSelection.js"));
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
}

function project(projectPath, latestVersion) {
  return {
    path: projectPath,
    ecosystems: ["python"],
    manifests: ["pyproject.toml"],
    warnings: [],
    errors: [],
    updates: [
      {
        id: `${projectPath}:python:streamlit`,
        ecosystem: "python",
        packageName: "streamlit",
        currentVersion: "1.58.0",
        wantedVersion: "",
        latestVersion,
        dependencyType: "uv.lock",
        releaseInfo: {},
      },
    ],
  };
}

function report(projects, reportFileName) {
  return {
    status: "ready",
    generatedAt: "2026-09-01",
    scanRoots: projects.map((item) => item.path),
    reportFileName,
    command: "dependency-report",
    canRunReporter: true,
    runMode: "server",
    projects,
    totals: { projects: projects.length, updates: projects.length, warnings: 0, errors: 0 },
  };
}

test("newer scoped reports override stale global project entries", () => {
  const { mergeDependencyReportSources } = loadSelectionModule();
  const streamlitPath = "/projects/streamlit-summarizer";
  const otherPath = "/projects/other";
  const merged = mergeDependencyReportSources([
    {
      modifiedAt: 1,
      report: report(
        [project(streamlitPath, "1.59.2"), project(otherPath, "2.0.0")],
        "global.json"
      ),
    },
    {
      modifiedAt: 2,
      report: report([project(streamlitPath, "1.62.0")], "scoped.json"),
    },
  ]);

  assert.equal(merged.projects.length, 2);
  assert.equal(
    merged.projects.find((item) => item.path === streamlitPath).updates[0].latestVersion,
    "1.62.0"
  );
  assert.ok(merged.projects.some((item) => item.path === otherPath));
});

test("project filtering returns only the requested project", () => {
  const { filterDependencyReportByProject } = loadSelectionModule();
  const streamlitPath = "/projects/streamlit-summarizer";
  const filtered = filterDependencyReportByProject(
    report([project(streamlitPath, "1.62.0"), project("/projects/other", "2.0.0")], "global.json"),
    `${streamlitPath}/`
  );

  assert.equal(filtered.status, "ready");
  assert.equal(filtered.projects.length, 1);
  assert.equal(filtered.projects[0].path, streamlitPath);
  assert.equal(filtered.totals.updates, 1);
});
