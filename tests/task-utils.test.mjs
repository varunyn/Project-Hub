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

function loadTaskStore(dataDir) {
  const outDir = mkdtempSync(path.join(tmpdir(), "project-hub-task-tsc-"));
  process.env.PROJECT_DATA_DIR = dataDir;
  try {
    execFileSync(
      "pnpm",
      [
        "exec",
        "tsc",
        "--ignoreConfig",
        "app/utils/taskUtils.ts",
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
    return require(path.join(outDir, "utils/taskUtils.js"));
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
}

function task(overrides = {}) {
  return {
    id: "task-1",
    projectId: "project-a",
    title: "Ship it",
    description: "",
    status: "todo",
    priority: "medium",
    assigneeId: "",
    labels: [],
    dueDate: "",
    position: 0,
    createdAt: "2026-07-29T00:00:00.000Z",
    updatedAt: "2026-07-29T00:00:00.000Z",
    ...overrides,
  };
}

test("project task queries are scoped and ordered by status position", async () => {
  const dataDir = mkdtempSync(path.join(tmpdir(), "project-hub-tasks-"));
  try {
    const store = loadTaskStore(dataDir);
    await store.createTask(task({ id: "a-2", position: 1 }));
    await store.createTask(task({ id: "a-1", position: 0 }));
    await store.createTask(task({ id: "b-1", projectId: "project-b" }));
    assert.deepEqual(
      store.getProjectTasks("project-a").map((item) => item.id),
      ["a-1", "a-2"]
    );
    assert.deepEqual(
      store.getProjectTasks("project-b").map((item) => item.id),
      ["b-1"]
    );
  } finally {
    rmSync(dataDir, { recursive: true, force: true });
  }
});

test("task updates and deletes cannot cross the project seam", async () => {
  const dataDir = mkdtempSync(path.join(tmpdir(), "project-hub-tasks-"));
  try {
    const store = loadTaskStore(dataDir);
    await store.createTask(task({ id: "shared-id", projectId: "project-b" }));
    assert.equal(
      await store.updateTask("project-a", "shared-id", { title: "Wrong project" }),
      null
    );
    assert.equal(await store.deleteTask("project-a", "shared-id"), false);
    assert.equal(store.getProjectTasks("project-b")[0].title, "Ship it");
  } finally {
    rmSync(dataDir, { recursive: true, force: true });
  }
});

test("moving a task normalizes positions within each status column", async () => {
  const dataDir = mkdtempSync(path.join(tmpdir(), "project-hub-tasks-"));
  try {
    const store = loadTaskStore(dataDir);
    await store.createTask(task({ id: "first", position: 0 }));
    await store.createTask(task({ id: "second", position: 1 }));
    await store.updateTask("project-a", "second", { status: "done" });
    assert.deepEqual(
      store.getProjectTasks("project-a").map((item) => [item.id, item.status, item.position]),
      [
        ["first", "todo", 0],
        ["second", "done", 0],
      ]
    );
  } finally {
    rmSync(dataDir, { recursive: true, force: true });
  }
});
