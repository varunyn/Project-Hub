import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function loadGitLogModule() {
  const outDir = mkdtempSync(path.join(tmpdir(), "project-hub-tsc-"));

  try {
    execFileSync(
      "pnpm",
      [
        "exec",
        "tsc",
        "--ignoreConfig",
        "app/api/projects/[id]/git-log/gitLog.ts",
        "app/utils/projectUtils.ts",
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

    return require(path.join(outDir, "api/projects/[id]/git-log/gitLog.js"));
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
}

function createRepo() {
  const dir = mkdtempSync(path.join(tmpdir(), "project-hub-git-log-"));
  execFileSync("git", ["init"], { cwd: dir, stdio: "ignore" });
  execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: dir });
  execFileSync("git", ["config", "user.name", "Project Hub Test"], { cwd: dir });
  execFileSync("git", ["commit", "--allow-empty", "-m", "Live git commit"], { cwd: dir });
  return dir;
}

function createParentRepoWithChildProject() {
  const repoDir = mkdtempSync(path.join(tmpdir(), "project-hub-parent-git-log-"));
  const childDir = path.join(repoDir, "child-project");
  mkdirSync(childDir);
  execFileSync("git", ["init"], { cwd: repoDir, stdio: "ignore" });
  execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: repoDir });
  execFileSync("git", ["config", "user.name", "Project Hub Test"], { cwd: repoDir });
  writeFileSync(path.join(childDir, "README.md"), "# Child Project\n");
  execFileSync("git", ["add", "child-project/README.md"], { cwd: repoDir });
  execFileSync("git", ["commit", "-m", "Track child project"], { cwd: repoDir });
  return { repoDir, childDir };
}

test("uses live git history before stored mock commits when a repo path exists", () => {
  const { getGitLogForProject } = loadGitLogModule();
  const repoPath = createRepo();

  try {
    const commits = getGitLogForProject({
      project: {
        id: "project-with-stale-mocks",
        name: "Project With Stale Mocks",
        path: repoPath,
        mockCommits: [
          {
            hash: "abc1234",
            subject: "Old mock commit",
            date: "2026-01-01T00:00:00-06:00",
          },
        ],
      },
    });

    assert.equal(commits[0]?.subject, "Live git commit");
  } finally {
    rmSync(repoPath, { recursive: true, force: true });
  }
});

test("uses parent repository history for a child project path", () => {
  const { getGitLogForProject } = loadGitLogModule();
  const { repoDir, childDir } = createParentRepoWithChildProject();

  try {
    const commits = getGitLogForProject({
      project: {
        id: "child-project",
        name: "Child Project",
        path: childDir,
      },
    });

    assert.equal(commits[0]?.subject, "Track child project");
  } finally {
    rmSync(repoDir, { recursive: true, force: true });
  }
});
