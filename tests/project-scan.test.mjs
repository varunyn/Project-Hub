import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function loadScanModule() {
  const outDir = mkdtempSync(path.join(tmpdir(), "project-hub-scan-tsc-"));

  try {
    execFileSync(
      "pnpm",
      [
        "exec",
        "tsc",
        "--ignoreConfig",
        "app/api/projects/scan/scanCore.ts",
        "--outDir",
        outDir,
        "--module",
        "Node16",
        "--target",
        "es2020",
        "--esModuleInterop",
        "--skipLibCheck",
        "--moduleResolution",
        "node16",
        "--types",
        "node",
      ],
      { cwd: projectRoot, stdio: "pipe" }
    );

    return require(path.join(outDir, "api/projects/scan/scanCore.js"));
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
}

function createProjectDir() {
  const dir = mkdtempSync(path.join(tmpdir(), "project-hub-scan-project-"));
  writeFileSync(
    path.join(dir, "package.json"),
    JSON.stringify({
      dependencies: {
        next: "16.2.6",
        react: "19.2.6",
      },
      devDependencies: {
        typescript: "6.0.3",
      },
    })
  );
  writeFileSync(path.join(dir, "README.md"), "# Scanned App\n\nUpdated README content.");
  return dir;
}

test("discover mode adds missing projects without changing existing project metadata", () => {
  const { mergeScannedProjects } = loadScanModule();
  const projectDir = createProjectDir();

  try {
    const existing = [
      {
        id: "existing-project",
        name: "Existing Project",
        path: projectDir,
        techStack: ["Manual"],
        readmePreview: "Manual summary",
        status: "completed",
        tags: ["client"],
        notes: "Keep this note",
        goals: ["Ship it"],
        dateCreated: "2026-01-01",
        lastUpdated: "2026-01-02",
      },
    ];

    const result = mergeScannedProjects({
      existingProjects: existing,
      discoveredPaths: [projectDir],
      today: "2026-06-17",
      mode: "discover",
    });

    assert.deepEqual(result.projects, existing);
    assert.equal(result.addedCount, 0);
    assert.equal(result.refreshedCount, 0);
  } finally {
    rmSync(projectDir, { recursive: true, force: true });
  }
});

test("refresh mode updates detected project metadata while preserving manual fields", () => {
  const { mergeScannedProjects } = loadScanModule();
  const projectDir = createProjectDir();

  try {
    const result = mergeScannedProjects({
      existingProjects: [
        {
          id: "existing-project",
          name: "Existing Project",
          path: projectDir,
          techStack: ["Manual"],
          readmePreview: "Manual summary",
          status: "completed",
          tags: ["client"],
          notes: "Keep this note",
          goals: ["Ship it"],
          dateCreated: "2026-01-01",
          lastUpdated: "2026-01-02",
        },
      ],
      discoveredPaths: [projectDir],
      today: "2026-06-17",
      mode: "refresh",
    });

    assert.equal(result.addedCount, 0);
    assert.equal(result.refreshedCount, 1);
    assert.deepEqual(result.projects[0].techStack, [
      "JavaScript",
      "React",
      "Next.js",
      "TypeScript",
    ]);
    assert.equal(result.projects[0].readmePreview, "# Scanned App\n\nUpdated README content.");
    assert.equal(result.projects[0].status, "completed");
    assert.deepEqual(result.projects[0].tags, ["client"]);
    assert.equal(result.projects[0].notes, "Keep this note");
    assert.deepEqual(result.projects[0].goals, ["Ship it"]);
    assert.equal(result.projects[0].lastUpdated, "2026-06-17");
  } finally {
    rmSync(projectDir, { recursive: true, force: true });
  }
});

test("refresh mode does not add newly discovered projects", () => {
  const { mergeScannedProjects } = loadScanModule();
  const projectDir = createProjectDir();

  try {
    const result = mergeScannedProjects({
      existingProjects: [],
      discoveredPaths: [projectDir],
      today: "2026-06-17",
      mode: "refresh",
    });

    assert.deepEqual(result.projects, []);
    assert.equal(result.addedCount, 0);
    assert.equal(result.refreshedCount, 0);
  } finally {
    rmSync(projectDir, { recursive: true, force: true });
  }
});
