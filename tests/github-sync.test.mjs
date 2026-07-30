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

function loadGithubSync() {
  const outDir = mkdtempSync(path.join(tmpdir(), "project-hub-github-tsc-"));
  try {
    execFileSync(
      "pnpm",
      [
        "exec",
        "tsc",
        "--ignoreConfig",
        "app/utils/githubSync.ts",
        "app/types.ts",
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
    return require(path.join(outDir, "utils/githubSync.js"));
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
}

test("parses a GitHub repository URL into an owner and repository", () => {
  const { parseGithubRepository } = loadGithubSync();
  assert.deepEqual(parseGithubRepository("https://github.com/acme/project-hub"), {
    owner: "acme",
    repo: "project-hub",
  });
});

test("maps an open GitHub issue to a local task without losing workflow detail", () => {
  const { githubIssueToTaskFields } = loadGithubSync();
  assert.deepEqual(
    githubIssueToTaskFields({
      number: 42,
      title: "Ship GitHub sync",
      body: "Connect issues to the board.",
      state: "open",
      html_url: "https://github.com/acme/project-hub/issues/42",
      labels: [{ name: "status:review" }, { name: "priority:high" }, { name: "bug" }],
    }),
    {
      title: "Ship GitHub sync",
      description: "Connect issues to the board.",
      status: "review",
      priority: "high",
      labels: ["bug"],
      githubIssueNumber: 42,
      githubIssueUrl: "https://github.com/acme/project-hub/issues/42",
    }
  );
});

test("builds a GitHub issue payload from a local task", () => {
  const { taskToGithubIssue } = loadGithubSync();
  assert.deepEqual(
    taskToGithubIssue({
      title: "Add sync",
      description: "Details",
      status: "in-progress",
      labels: ["bug"],
    }),
    { title: "Add sync", body: "Details", labels: ["bug", "status:in-progress"] }
  );
});

test("maps task completion to the GitHub issue state", () => {
  const { githubIssueStateForTask, githubStatusLabelForTask } = loadGithubSync();
  assert.equal(githubIssueStateForTask("done"), "closed");
  assert.equal(githubIssueStateForTask("in-progress"), "open");
  assert.equal(githubStatusLabelForTask("review"), "status:review");
});
