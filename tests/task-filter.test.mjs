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

function loadTaskFilter() {
  const outDir = mkdtempSync(path.join(tmpdir(), "project-hub-task-filter-tsc-"));
  try {
    execFileSync(
      "pnpm",
      [
        "exec",
        "tsc",
        "--ignoreConfig",
        "app/lib/taskFilter.ts",
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
    return require(path.join(outDir, "lib/taskFilter.js"));
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
}

function task(overrides = {}) {
  return {
    id: "task-1",
    projectId: "project-a",
    title: "Ship it",
    description: "Final delivery",
    status: "todo",
    priority: "medium",
    assigneeId: "",
    labels: ["frontend"],
    dueDate: "",
    position: 0,
    createdAt: "2026-07-29T00:00:00.000Z",
    updatedAt: "2026-07-29T00:00:00.000Z",
    ...overrides,
  };
}

test("filterTasks searches title, description, and labels", () => {
  const { filterTasks } = loadTaskFilter();
  const tasks = [
    task({ id: "t1", title: "Ship it" }),
    task({ id: "t2", title: "Refactor auth module", description: "" }),
    task({ id: "t3", title: "Deploy service", labels: ["backend"] }),
  ];

  assert.deepEqual(
    filterTasks(tasks, { query: "ship" }).map((item) => item.id),
    ["t1"]
  );
  assert.deepEqual(
    filterTasks(tasks, { query: "auth" }).map((item) => item.id),
    ["t2"]
  );
  assert.deepEqual(
    filterTasks(tasks, { query: "backend" }).map((item) => item.id),
    ["t3"]
  );
});

test("filterTasks filters by priority", () => {
  const { filterTasks } = loadTaskFilter();
  const tasks = [
    task({ id: "t1", priority: "low" }),
    task({ id: "t2", priority: "high" }),
    task({ id: "t3", priority: "high" }),
  ];

  assert.deepEqual(
    filterTasks(tasks, { priority: "high" }).map((item) => item.id),
    ["t2", "t3"]
  );
});

test("filterTasks filters by project", () => {
  const { filterTasks } = loadTaskFilter();
  const tasks = [
    task({ id: "t1", projectId: "project-a" }),
    task({ id: "t2", projectId: "project-b" }),
    task({ id: "t3", projectId: "project-a" }),
  ];

  assert.deepEqual(
    filterTasks(tasks, { projectId: "project-a" }).map((item) => item.id),
    ["t1", "t3"]
  );
});

test("filterTasks combines query, priority, and project filters", () => {
  const { filterTasks } = loadTaskFilter();
  const tasks = [
    task({ id: "t1", projectId: "project-a", priority: "high", title: "Ship it" }),
    task({ id: "t2", projectId: "project-a", priority: "low", title: "Ship it" }),
    task({ id: "t3", projectId: "project-b", priority: "high", title: "Ship it" }),
  ];

  assert.deepEqual(
    filterTasks(tasks, { query: "ship", priority: "high", projectId: "project-a" }).map(
      (item) => item.id
    ),
    ["t1"]
  );
});

test("filterTasks returns all tasks when no filters are provided", () => {
  const { filterTasks } = loadTaskFilter();
  const tasks = [task({ id: "t1" }), task({ id: "t2" })];

  assert.deepEqual(
    filterTasks(tasks, {}).map((item) => item.id),
    ["t1", "t2"]
  );
});
