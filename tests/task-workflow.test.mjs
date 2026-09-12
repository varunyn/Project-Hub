import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

const require = createRequire(import.meta.url);
const projectRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");

function loadWorkflow(dataDir) {
  const outDir = mkdtempSync(path.join(tmpdir(), "project-hub-workflow-tsc-"));
  process.env.PROJECT_DATA_DIR = dataDir;
  execFileSync(
    "pnpm",
    [
      "exec",
      "tsc",
      "--ignoreConfig",
      "app/lib/taskWorkflow.ts",
      "app/utils/taskUtils.ts",
      "app/utils/projectUtils.ts",
      "app/utils/fileLock.ts",
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
  return { workflow: require(path.join(outDir, "lib/taskWorkflow.js")), outDir };
}

function storage() {
  const dataDir = mkdtempSync(path.join(tmpdir(), "project-hub-workflow-"));
  writeFileSync(
    path.join(dataDir, "projects.json"),
    JSON.stringify([{ id: "p", name: "Project" }])
  );
  writeFileSync(path.join(dataDir, "tasks.json"), "[]");
  return dataDir;
}

test("workflow owns defaults, normalization, identity, timestamps, and project membership", async () => {
  const dataDir = storage();
  const { workflow, outDir } = loadWorkflow(dataDir);
  try {
    const created = await new workflow.TaskWorkflow({
      now: () => "2026-01-01T00:00:00.000Z",
      generateId: () => "task-1",
    }).createTask({ projectId: "p", title: "  Ship it  " });
    assert.deepEqual(created, {
      id: "task-1",
      projectId: "p",
      title: "Ship it",
      description: "",
      status: "todo",
      priority: "medium",
      assigneeId: "",
      labels: [],
      dueDate: "",
      position: 0,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    await assert.rejects(
      () => new workflow.TaskWorkflow().createTask({ projectId: "missing", title: "x" }),
      (error) => error.code === "project_not_found"
    );
  } finally {
    rmSync(outDir, { recursive: true, force: true });
    rmSync(dataDir, { recursive: true, force: true });
  }
});

test("workflow assigns concurrent creations unique positions under the file lock", async () => {
  const dataDir = storage();
  const { workflow, outDir } = loadWorkflow(dataDir);
  try {
    const values = await Promise.all(
      Array.from({ length: 8 }, (_, index) =>
        workflow.createTask({ projectId: "p", title: `Task ${index}` })
      )
    );
    assert.deepEqual(
      values.map((task) => task.position).sort((a, b) => a - b),
      [0, 1, 2, 3, 4, 5, 6, 7]
    );
    assert.equal(JSON.parse(readFileSync(path.join(dataDir, "tasks.json"), "utf8")).length, 8);
  } finally {
    rmSync(outDir, { recursive: true, force: true });
    rmSync(dataDir, { recursive: true, force: true });
  }
});

test("complete creation input persists every caller field and trims only the title", async () => {
  const dataDir = storage();
  const { workflow, outDir } = loadWorkflow(dataDir);
  try {
    const created = await new workflow.TaskWorkflow({
      now: () => "2026-01-02T00:00:00.000Z",
      generateId: () => "complete-task",
    }).createTask({
      projectId: "p",
      title: "  Complete task  ",
      description: "Detailed work",
      status: "review",
      priority: "high",
      assigneeId: "user-1",
      labels: ["api", "urgent"],
      dueDate: "2026-02-03",
    });
    assert.deepEqual(
      {
        projectId: created.projectId,
        title: created.title,
        description: created.description,
        status: created.status,
        priority: created.priority,
        assigneeId: created.assigneeId,
        labels: created.labels,
        dueDate: created.dueDate,
      },
      {
        projectId: "p",
        title: "Complete task",
        description: "Detailed work",
        status: "review",
        priority: "high",
        assigneeId: "user-1",
        labels: ["api", "urgent"],
        dueDate: "2026-02-03",
      }
    );
  } finally {
    rmSync(outDir, { recursive: true, force: true });
    rmSync(dataDir, { recursive: true, force: true });
  }
});

test("invalid creation input returns a typed failure without changing persistence", async () => {
  const dataDir = storage();
  const { workflow, outDir } = loadWorkflow(dataDir);
  try {
    const before = readFileSync(path.join(dataDir, "tasks.json"), "utf8");
    const invalidInputs = [
      { projectId: "p", title: "   " },
      { projectId: "p", title: "valid", status: "blocked" },
      { projectId: "p", title: "valid", labels: Array.from({ length: 11 }, () => "x") },
      { projectId: "p", title: "valid", dueDate: "tomorrow" },
    ];
    for (const input of invalidInputs) {
      await assert.rejects(
        () => workflow.createTask(input),
        (error) => error.name === "TaskWorkflowError" && error.code === "invalid_task"
      );
      assert.equal(readFileSync(path.join(dataDir, "tasks.json"), "utf8"), before);
    }
  } finally {
    rmSync(outDir, { recursive: true, force: true });
    rmSync(dataDir, { recursive: true, force: true });
  }
});

test("update is atomic, rejects protected fields, moves within lanes, and delete normalizes positions", async () => {
  const dataDir = storage();
  const { workflow, outDir } = loadWorkflow(dataDir);
  try {
    const first = await workflow.createTask({ projectId: "p", title: "First" });
    const second = await workflow.createTask({ projectId: "p", title: "Second" });
    const before = readFileSync(path.join(dataDir, "tasks.json"), "utf8");
    await assert.rejects(
      () =>
        workflow.updateTaskWorkflow({
          projectId: "p",
          taskId: first.id,
          changes: { title: "Changed", githubIssueNumber: 44 },
        }),
      (error) => error.code === "invalid_task"
    );
    assert.equal(readFileSync(path.join(dataDir, "tasks.json"), "utf8"), before);
    const updated = await workflow.updateTaskWorkflow({
      projectId: "p",
      taskId: first.id,
      changes: { title: "Changed", position: 1 },
    });
    assert.equal(updated.task.title, "Changed");
    assert.equal(updated.task.position, 1);
    await workflow.deleteTaskWorkflow("p", second.id);
    const remaining = JSON.parse(readFileSync(path.join(dataDir, "tasks.json"), "utf8"));
    assert.equal(remaining.find((task) => task.id === first.id).position, 0);
    const beforeEmpty = readFileSync(path.join(dataDir, "tasks.json"), "utf8");
    await assert.rejects(
      () => workflow.updateTaskWorkflow({ projectId: "p", taskId: first.id, changes: {} }),
      (error) => error.code === "invalid_task"
    );
    assert.equal(readFileSync(path.join(dataDir, "tasks.json"), "utf8"), beforeEmpty);
  } finally {
    rmSync(outDir, { recursive: true, force: true });
    rmSync(dataDir, { recursive: true, force: true });
  }
});

test("deleting a GitHub-linked task is local-only and normalizes remaining positions", async () => {
  const dataDir = storage();
  writeFileSync(
    path.join(dataDir, "tasks.json"),
    JSON.stringify([
      {
        id: "linked",
        projectId: "p",
        title: "Linked",
        description: "",
        status: "todo",
        priority: "medium",
        assigneeId: "",
        labels: [],
        dueDate: "",
        position: 0,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        githubIssueNumber: 42,
        githubIssueUrl: "https://github.com/example/repo/issues/42",
      },
      {
        id: "remaining",
        projectId: "p",
        title: "Remaining",
        description: "",
        status: "todo",
        priority: "medium",
        assigneeId: "",
        labels: [],
        dueDate: "",
        position: 1,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ])
  );
  const { workflow, outDir } = loadWorkflow(dataDir);
  try {
    const deleted = await workflow.deleteTaskWorkflow("p", "linked");
    assert.equal(deleted.githubIssueNumber, 42);
    assert.deepEqual(JSON.parse(readFileSync(path.join(dataDir, "tasks.json"), "utf8")), [
      {
        id: "remaining",
        projectId: "p",
        title: "Remaining",
        description: "",
        status: "todo",
        priority: "medium",
        assigneeId: "",
        labels: [],
        dueDate: "",
        position: 0,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ]);
  } finally {
    rmSync(outDir, { recursive: true, force: true });
    rmSync(dataDir, { recursive: true, force: true });
  }
});

test("linked status synchronization is local-first, concurrent, durable, and safe", async () => {
  const dataDir = storage();
  writeFileSync(
    path.join(dataDir, "projects.json"),
    JSON.stringify([{ id: "p", name: "Project", githubUrl: "https://github.com/a/r" }])
  );
  writeFileSync(
    path.join(dataDir, "tasks.json"),
    JSON.stringify([
      {
        id: "t",
        projectId: "p",
        title: "T",
        description: "",
        status: "todo",
        priority: "medium",
        assigneeId: "",
        labels: [],
        dueDate: "",
        position: 0,
        createdAt: "x",
        updatedAt: "x",
        githubIssueNumber: 4,
      },
    ])
  );
  const { workflow, outDir } = loadWorkflow(dataDir);
  const taskUtils = require(path.join(outDir, "utils/taskUtils.js"));
  try {
    const calls = [];
    const waiters = [];
    let firstStarted;
    const firstStartedPromise = new Promise((resolve) => (firstStarted = resolve));
    const adapter = {
      mirrorStatus: async (task) => {
        calls.push(task.status);
        if (calls.length === 1) firstStarted();
        await new Promise((resolve) => waiters.push(resolve));
      },
    };
    const instance = new workflow.TaskWorkflow({
      githubAdapter: adapter,
      generateId: (() => {
        let n = 0;
        return () => `attempt-${n++}`;
      })(),
    });
    const first = instance.updateTask({
      projectId: "p",
      taskId: "t",
      changes: { status: "in-progress" },
    });
    await firstStartedPromise;
    const during = JSON.parse(readFileSync(path.join(dataDir, "tasks.json"), "utf8"))[0];
    assert.equal(during.status, "in-progress");
    assert.equal(during.githubSynchronization.state, "pending");
    assert.equal(JSON.stringify(taskUtils.getTasks()).includes("_githubSyncAttemptId"), false);
    const second = instance.updateTask({
      projectId: "p",
      taskId: "t",
      changes: { status: "review" },
    });
    while (
      JSON.parse(readFileSync(path.join(dataDir, "tasks.json"), "utf8"))[0].status !== "review"
    )
      await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(calls, ["in-progress"]);
    const secondPending = JSON.parse(readFileSync(path.join(dataDir, "tasks.json"), "utf8"))[0];
    assert.equal(secondPending.githubSynchronization.state, "pending");
    assert.equal(Object.hasOwn(secondPending, "_githubSyncAttemptId"), true);
    waiters.shift()();
    const firstResult = await first;
    assert.equal(firstResult.githubSynchronization.status, "synced");
    assert.equal(
      JSON.parse(readFileSync(path.join(dataDir, "tasks.json"), "utf8"))[0].status,
      "review"
    );
    assert.equal(
      JSON.parse(readFileSync(path.join(dataDir, "tasks.json"), "utf8"))[0].githubSynchronization
        .state,
      "pending"
    );
    while (calls.length < 2) await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(calls, ["in-progress", "review"]);
    waiters.shift()();
    const secondResult = await second;
    assert.equal(secondResult.githubSynchronization.status, "synced");
    assert.equal(secondResult.task.status, "review");
    assert.equal(
      JSON.parse(readFileSync(path.join(dataDir, "tasks.json"), "utf8"))[0].status,
      "review"
    );
    assert.equal(
      JSON.parse(readFileSync(path.join(dataDir, "tasks.json"), "utf8"))[0].githubSynchronization
        .state,
      "synced"
    );
    assert.equal(Object.hasOwn(secondResult.task, "_githubSyncAttemptId"), false);
    assert.equal(JSON.stringify(taskUtils.getTasks()).includes("_githubSyncAttemptId"), false);

    const failure = new workflow.TaskWorkflow({
      githubAdapter: {
        mirrorStatus: async () => {
          throw new Error("raw-secret=shh-123");
        },
      },
    });
    const failed = await failure.updateTask({
      projectId: "p",
      taskId: "t",
      changes: { status: "done" },
    });
    assert.equal(failed.task.status, "done");
    assert.equal(failed.githubSynchronization.status, "failed");
    assert.equal(failed.task.githubSynchronization.state, "failed");
    assert.equal(failed.githubSynchronization.error.includes("shh-123"), false);
    assert.equal(JSON.stringify(failed).includes("raw-secret"), false);
    const ordinary = await failure.updateTask({
      projectId: "p",
      taskId: "t",
      changes: { title: "Local" },
    });
    assert.equal(ordinary.githubSynchronization.status, "not-required");
  } finally {
    rmSync(outDir, { recursive: true, force: true });
    rmSync(dataDir, { recursive: true, force: true });
  }
});

test("legacy linked tasks lazily acquire synchronization state and local-only edits do not sync", async () => {
  const dataDir = storage();
  writeFileSync(
    path.join(dataDir, "projects.json"),
    JSON.stringify([{ id: "p", name: "Project", githubUrl: "https://github.com/a/r" }])
  );
  writeFileSync(
    path.join(dataDir, "tasks.json"),
    JSON.stringify([
      {
        id: "t",
        projectId: "p",
        title: "T",
        description: "",
        status: "todo",
        priority: "medium",
        assigneeId: "",
        labels: [],
        dueDate: "",
        position: 0,
        createdAt: "x",
        updatedAt: "x",
        githubIssueNumber: 4,
      },
    ])
  );
  const { workflow, outDir } = loadWorkflow(dataDir);
  try {
    let calls = 0;
    const instance = new workflow.TaskWorkflow({
      githubAdapter: {
        mirrorStatus: async () => {
          calls += 1;
        },
      },
    });
    const legacy = JSON.parse(readFileSync(path.join(dataDir, "tasks.json"), "utf8"))[0];
    assert.equal(legacy.githubSynchronization, undefined);
    const local = await instance.updateTask({
      projectId: "p",
      taskId: "t",
      changes: { title: "Local" },
    });
    assert.equal(local.githubSynchronization.status, "not-required");
    assert.equal(calls, 0);
    const status = await instance.updateTask({
      projectId: "p",
      taskId: "t",
      changes: { status: "done" },
    });
    assert.equal(status.githubSynchronization.status, "synced");
    assert.equal(calls, 1);
    assert.equal(
      JSON.parse(readFileSync(path.join(dataDir, "tasks.json"), "utf8"))[0].githubSynchronization
        .state,
      "synced"
    );
  } finally {
    rmSync(outDir, { recursive: true, force: true });
    rmSync(dataDir, { recursive: true, force: true });
  }
});

test("retry mirrors the current local status, persists pending, and rejects unlinked tasks", async () => {
  const dataDir = storage();
  writeFileSync(
    path.join(dataDir, "projects.json"),
    JSON.stringify([{ id: "p", name: "Project", githubUrl: "https://github.com/a/r" }])
  );
  writeFileSync(
    path.join(dataDir, "tasks.json"),
    JSON.stringify([
      {
        id: "t",
        projectId: "p",
        title: "T",
        description: "",
        status: "todo",
        priority: "medium",
        assigneeId: "",
        labels: [],
        dueDate: "",
        position: 0,
        createdAt: "x",
        updatedAt: "x",
        githubIssueNumber: 4,
        githubSynchronization: {
          state: "failed",
          attemptedAt: "old",
          error: "GitHub synchronization failed",
        },
      },
    ])
  );
  const { workflow, outDir } = loadWorkflow(dataDir);
  try {
    const seen = [];
    const instance = new workflow.TaskWorkflow({
      now: () => "retry-time",
      generateId: () => "retry-attempt",
      githubAdapter: {
        mirrorStatus: async (task) => {
          const persisted = JSON.parse(readFileSync(path.join(dataDir, "tasks.json"), "utf8"))[0];
          assert.equal(task.status, "review");
          assert.equal(persisted.status, "review");
          assert.equal(persisted.githubSynchronization.state, "pending");
          seen.push(task.status);
        },
      },
    });
    // Simulate a newer local decision after the old failed attempt.
    const stored = JSON.parse(readFileSync(path.join(dataDir, "tasks.json"), "utf8"));
    stored[0].status = "review";
    writeFileSync(path.join(dataDir, "tasks.json"), JSON.stringify(stored));
    const retried = await instance.retryGithubStatus({ projectId: "p", taskId: "t" });
    assert.deepEqual(seen, ["review"]);
    assert.equal(retried.task.status, "review");
    assert.equal(retried.task.githubSynchronization.state, "synced");

    stored[0].githubIssueNumber = undefined;
    writeFileSync(path.join(dataDir, "tasks.json"), JSON.stringify(stored));
    await assert.rejects(
      () => instance.retryGithubStatus({ projectId: "p", taskId: "t" }),
      (error) => error.code === "task_not_linked"
    );
  } finally {
    rmSync(outDir, { recursive: true, force: true });
    rmSync(dataDir, { recursive: true, force: true });
  }
});

test("retry keeps repeated adapter failures durable and records missing configuration safely", async () => {
  const dataDir = storage();
  writeFileSync(
    path.join(dataDir, "projects.json"),
    JSON.stringify([{ id: "p", name: "Project", githubUrl: "https://github.com/a/r" }])
  );
  writeFileSync(
    path.join(dataDir, "tasks.json"),
    JSON.stringify([
      {
        id: "t",
        projectId: "p",
        title: "T",
        description: "",
        status: "todo",
        priority: "medium",
        assigneeId: "",
        labels: [],
        dueDate: "",
        position: 0,
        createdAt: "x",
        updatedAt: "x",
        githubIssueNumber: 4,
        githubSynchronization: { state: "failed", attemptedAt: "old", error: "old" },
      },
    ])
  );
  const { workflow, outDir } = loadWorkflow(dataDir);
  const originalToken = process.env.GITHUB_TOKEN;
  try {
    let calls = 0;
    const instance = new workflow.TaskWorkflow({
      githubAdapter: {
        mirrorStatus: async () => {
          calls += 1;
          throw new Error("provider secret should not leak");
        },
      },
    });
    const first = await instance.retryGithubStatus({ projectId: "p", taskId: "t" });
    const second = await instance.retryGithubStatus({ projectId: "p", taskId: "t" });
    assert.equal(calls, 2);
    assert.equal(first.githubSynchronization.status, "failed");
    assert.equal(second.githubSynchronization.status, "failed");
    assert.equal(second.task.githubSynchronization.state, "failed");
    assert.equal(second.task.githubSynchronization.error, "GitHub synchronization failed");
    assert.equal(JSON.stringify(second).includes("provider secret"), false);
    assert.equal(
      JSON.parse(readFileSync(path.join(dataDir, "tasks.json"), "utf8"))[0].githubSynchronization
        .state,
      "failed"
    );

    delete process.env.GITHUB_TOKEN;
    const missingConfig = new workflow.TaskWorkflow();
    const configuredFailure = await missingConfig.retryGithubStatus({
      projectId: "p",
      taskId: "t",
    });
    assert.equal(configuredFailure.githubSynchronization.status, "failed");
    assert.equal(
      configuredFailure.githubSynchronization.error,
      "GitHub synchronization is not configured"
    );
    await assert.rejects(
      () => instance.retryGithubStatus({ projectId: "p", taskId: "missing" }),
      (error) => error.code === "task_not_found"
    );
  } finally {
    if (originalToken === undefined) delete process.env.GITHUB_TOKEN;
    else process.env.GITHUB_TOKEN = originalToken;
    rmSync(outDir, { recursive: true, force: true });
    rmSync(dataDir, { recursive: true, force: true });
  }
});

test("overlapping retry and newer status update cannot overwrite the newer fenced attempt", async () => {
  const dataDir = storage();
  writeFileSync(
    path.join(dataDir, "projects.json"),
    JSON.stringify([{ id: "p", name: "Project", githubUrl: "https://github.com/a/r" }])
  );
  writeFileSync(
    path.join(dataDir, "tasks.json"),
    JSON.stringify([
      {
        id: "t",
        projectId: "p",
        title: "T",
        description: "",
        status: "todo",
        priority: "medium",
        assigneeId: "",
        labels: [],
        dueDate: "",
        position: 0,
        createdAt: "x",
        updatedAt: "x",
        githubIssueNumber: 4,
        githubSynchronization: { state: "failed", attemptedAt: "old", error: "old" },
      },
    ])
  );
  const { workflow, outDir } = loadWorkflow(dataDir);
  try {
    const calls = [];
    const waiters = [];
    let firstStarted;
    const firstStartedPromise = new Promise((resolve) => (firstStarted = resolve));
    const instance = new workflow.TaskWorkflow({
      githubAdapter: {
        mirrorStatus: async (task) => {
          calls.push(task.status);
          if (calls.length === 1) firstStarted();
          await new Promise((resolve) => waiters.push(resolve));
        },
      },
      generateId: (() => {
        let count = 0;
        return () => `attempt-${count++}`;
      })(),
    });
    const retry = instance.retryGithubStatus({ projectId: "p", taskId: "t" });
    await firstStartedPromise;
    const newer = instance.updateTask({
      projectId: "p",
      taskId: "t",
      changes: { status: "review" },
    });
    while (
      JSON.parse(readFileSync(path.join(dataDir, "tasks.json"), "utf8"))[0].status !== "review"
    )
      await new Promise((resolve) => setImmediate(resolve));
    const pending = JSON.parse(readFileSync(path.join(dataDir, "tasks.json"), "utf8"))[0];
    assert.equal(pending.githubSynchronization.state, "pending");
    assert.deepEqual(calls, ["todo"]);
    waiters.shift()();
    await retry;
    while (calls.length < 2) await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(calls, ["todo", "review"]);
    assert.equal(
      JSON.parse(readFileSync(path.join(dataDir, "tasks.json"), "utf8"))[0].githubSynchronization
        .state,
      "pending"
    );
    waiters.shift()();
    const newerResult = await newer;
    assert.equal(newerResult.task.status, "review");
    assert.equal(newerResult.task.githubSynchronization.state, "synced");
    const final = JSON.parse(readFileSync(path.join(dataDir, "tasks.json"), "utf8"))[0];
    assert.equal(final.status, "review");
    assert.equal(final.githubSynchronization.state, "synced");
  } finally {
    rmSync(outDir, { recursive: true, force: true });
    rmSync(dataDir, { recursive: true, force: true });
  }
});

test("link reserves before injected creation, attaches, clears reservation, and syncs", async () => {
  const dataDir = storage();
  const task = {
    id: "t",
    projectId: "p",
    title: "Link me",
    description: "body",
    status: "todo",
    priority: "medium",
    assigneeId: "",
    labels: [],
    dueDate: "",
    position: 0,
    createdAt: "x",
    updatedAt: "x",
  };
  writeFileSync(path.join(dataDir, "tasks.json"), JSON.stringify([task]));
  writeFileSync(path.join(dataDir, "projects.json"), JSON.stringify([{ id: "p", name: "P" }]));
  const { workflow, outDir } = loadWorkflow(dataDir);
  try {
    const seen = [];
    const result = await new workflow.TaskWorkflow({
      githubLinkAdapter: {
        createIssue: async () => {
          const persisted = JSON.parse(readFileSync(path.join(dataDir, "tasks.json"), "utf8"))[0];
          seen.push(persisted.githubLinkReservation?.state);
          return {
            number: 7,
            html_url: "https://github.test/7",
            title: "Link me",
            body: "",
            state: "open",
            labels: [],
          };
        },
        mirrorStatus: async () => undefined,
      },
      generateId: (() => {
        let n = 0;
        return () => `id-${n++}`;
      })(),
    }).linkGithubIssue("p", "t");
    assert.equal(result.status, "linked");
    assert.deepEqual(seen, ["creating"]);
    const stored = JSON.parse(readFileSync(path.join(dataDir, "tasks.json"), "utf8"))[0];
    assert.equal(stored.githubIssueNumber, 7);
    assert.equal(stored.githubLinkReservation, undefined);
    assert.equal(JSON.stringify(result).includes("_github"), false);
  } finally {
    rmSync(outDir, { recursive: true, force: true });
    rmSync(dataDir, { recursive: true, force: true });
  }
});

test("already-linked and known partial recovery do not require configuration or recreate", async () => {
  const dataDir = storage();
  writeFileSync(path.join(dataDir, "projects.json"), JSON.stringify([{ id: "p", name: "P" }]));
  writeFileSync(
    path.join(dataDir, "tasks.json"),
    JSON.stringify([
      {
        id: "t",
        projectId: "p",
        title: "T",
        description: "",
        status: "todo",
        priority: "medium",
        assigneeId: "",
        labels: [],
        dueDate: "",
        position: 0,
        createdAt: "x",
        updatedAt: "x",
        githubIssueNumber: 3,
        githubIssueUrl: "https://github.test/3",
      },
    ])
  );
  const { workflow, outDir } = loadWorkflow(dataDir);
  try {
    let creates = 0;
    const instance = new workflow.TaskWorkflow({
      githubLinkAdapter: {
        createIssue: async () => {
          creates += 1;
          throw new Error("must not create");
        },
        mirrorStatus: async () => undefined,
      },
    });
    const already = await instance.linkGithubIssue("p", "t");
    assert.equal(already.status, "already-linked");
    assert.equal(creates, 0);
    const stored = JSON.parse(readFileSync(path.join(dataDir, "tasks.json"), "utf8"));
    stored[0].githubIssueNumber = undefined;
    stored[0].githubIssueUrl = undefined;
    stored[0].githubLinkReservation = {
      state: "partial",
      reservedAt: "x",
      issueNumber: 9,
      issueUrl: "https://github.test/9",
    };
    stored[0]._githubLinkReservationId = "old-reservation";
    writeFileSync(path.join(dataDir, "tasks.json"), JSON.stringify(stored));
    const recovered = await instance.linkGithubIssue("p", "t");
    assert.equal(recovered.status, "linked");
    assert.equal(creates, 0);
    assert.equal(
      JSON.parse(readFileSync(path.join(dataDir, "tasks.json"), "utf8"))[0].githubIssueNumber,
      9
    );
  } finally {
    rmSync(outDir, { recursive: true, force: true });
    rmSync(dataDir, { recursive: true, force: true });
  }
});

test("definite link failure clears reservation while uncertain failure retains conflict", async () => {
  const dataDir = storage();
  const task = {
    id: "t",
    projectId: "p",
    title: "T",
    description: "",
    status: "todo",
    priority: "medium",
    assigneeId: "",
    labels: [],
    dueDate: "",
    position: 0,
    createdAt: "x",
    updatedAt: "x",
  };
  writeFileSync(path.join(dataDir, "tasks.json"), JSON.stringify([task]));
  const { workflow, outDir } = loadWorkflow(dataDir);
  try {
    const definite = new workflow.TaskWorkflow({
      githubLinkAdapter: {
        createIssue: async () => {
          throw new workflow.GithubIssueCreationError(
            "definite-failure",
            "GitHub issue creation failed (422)"
          );
        },
        mirrorStatus: async () => undefined,
      },
    });
    const failed = await definite.linkGithubIssue("p", "t");
    assert.equal(failed.status, "failed");
    assert.equal(
      JSON.parse(readFileSync(path.join(dataDir, "tasks.json"), "utf8"))[0].githubLinkReservation,
      undefined
    );
    const uncertain = new workflow.TaskWorkflow({
      githubLinkAdapter: {
        createIssue: async () => {
          throw new workflow.GithubIssueCreationError("uncertain", "network timeout");
        },
        mirrorStatus: async () => undefined,
      },
    });
    const blocked = await uncertain.linkGithubIssue("p", "t");
    assert.equal(blocked.status, "uncertain");
    const ordinaryUpdate = await uncertain.updateTask({
      projectId: "p",
      taskId: "t",
      changes: { title: "Still reserved" },
    });
    assert.equal(Object.hasOwn(ordinaryUpdate.task, "_githubLinkReservationId"), false);
    const conflict = await uncertain.linkGithubIssue("p", "t");
    assert.equal(conflict.status, "conflict");
  } finally {
    rmSync(outDir, { recursive: true, force: true });
    rmSync(dataDir, { recursive: true, force: true });
  }
});

test("production create classifies definite and uncertain HTTP responses", async () => {
  const dataDir = storage();
  writeFileSync(
    path.join(dataDir, "projects.json"),
    JSON.stringify([{ id: "p", name: "Project", githubUrl: "https://github.com/a/r" }])
  );
  writeFileSync(
    path.join(dataDir, "tasks.json"),
    JSON.stringify([
      {
        id: "t",
        projectId: "p",
        title: "T",
        description: "",
        status: "todo",
        priority: "medium",
        assigneeId: "",
        labels: [],
        dueDate: "",
        position: 0,
        createdAt: "x",
        updatedAt: "x",
      },
    ])
  );
  const { workflow, outDir } = loadWorkflow(dataDir);
  const originalToken = process.env.GITHUB_TOKEN;
  const originalFetch = globalThis.fetch;
  process.env.GITHUB_TOKEN = "test-token";
  try {
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ message: "bad" }), { status: 422 });
    const definite = await new workflow.TaskWorkflow().linkGithubIssue("p", "t");
    assert.equal(definite.status, "failed");
    assert.equal(
      JSON.parse(readFileSync(path.join(dataDir, "tasks.json"), "utf8"))[0].githubLinkReservation,
      undefined
    );

    globalThis.fetch = async () =>
      new Response(JSON.stringify({ message: "busy" }), { status: 429 });
    const uncertain = await new workflow.TaskWorkflow().linkGithubIssue("p", "t");
    assert.equal(uncertain.status, "uncertain");
    const blocked = await new workflow.TaskWorkflow().linkGithubIssue("p", "t");
    assert.equal(blocked.status, "conflict");
  } finally {
    globalThis.fetch = originalFetch;
    if (originalToken === undefined) delete process.env.GITHUB_TOKEN;
    else process.env.GITHUB_TOKEN = originalToken;
    rmSync(outDir, { recursive: true, force: true });
    rmSync(dataDir, { recursive: true, force: true });
  }
});

test("concurrent link and delete are blocked by the durable reservation", async () => {
  const dataDir = storage();
  writeFileSync(
    path.join(dataDir, "tasks.json"),
    JSON.stringify([
      {
        id: "t",
        projectId: "p",
        title: "T",
        description: "",
        status: "todo",
        priority: "medium",
        assigneeId: "",
        labels: [],
        dueDate: "",
        position: 0,
        createdAt: "x",
        updatedAt: "x",
      },
    ])
  );
  const { workflow, outDir } = loadWorkflow(dataDir);
  try {
    let release;
    const entered = new Promise((resolve) => {
      release = resolve;
    });
    let count = 0;
    const instance = new workflow.TaskWorkflow({
      githubLinkAdapter: {
        createIssue: async () => {
          count += 1;
          await entered;
          return {
            number: 4,
            html_url: "https://github.test/4",
            title: "T",
            body: "",
            state: "open",
            labels: [],
          };
        },
        mirrorStatus: async () => undefined,
      },
    });
    const first = instance.linkGithubIssue("p", "t");
    while (
      !JSON.parse(readFileSync(path.join(dataDir, "tasks.json"), "utf8"))[0].githubLinkReservation
    )
      await new Promise((r) => setImmediate(r));
    const second = await instance.linkGithubIssue("p", "t");
    assert.equal(second.status, "conflict");
    await assert.rejects(
      () => instance.deleteTask("p", "t"),
      (error) => error.code === "github_link_conflict"
    );
    assert.equal(count, 1);
    release();
    const result = await first;
    assert.equal(result.status, "linked");
  } finally {
    rmSync(outDir, { recursive: true, force: true });
    rmSync(dataDir, { recursive: true, force: true });
  }
});

test("attachment failure stores a known partial and recovery attaches without recreating", async () => {
  const dataDir = storage();
  writeFileSync(
    path.join(dataDir, "tasks.json"),
    JSON.stringify([
      {
        id: "t",
        projectId: "p",
        title: "T",
        description: "",
        status: "review",
        priority: "medium",
        assigneeId: "",
        labels: [],
        dueDate: "",
        position: 0,
        createdAt: "x",
        updatedAt: "x",
      },
    ])
  );
  const { workflow, outDir } = loadWorkflow(dataDir);
  try {
    let creates = 0;
    let fail = true;
    const adapter = {
      createIssue: async () => {
        creates += 1;
        return {
          number: 8,
          html_url: "https://github.test/8",
          title: "T",
          body: "",
          state: "open",
          labels: [],
        };
      },
      mirrorStatus: async (task) => assert.equal(task.status, "review"),
    };
    const instance = new workflow.TaskWorkflow({
      beforeGithubLinkAttachment: async () => {
        if (fail) {
          fail = false;
          throw new Error("attachment failure");
        }
      },
      githubAdapter: adapter,
      githubLinkAdapter: adapter,
    });
    const partial = await instance.linkGithubIssue("p", "t");
    assert.equal(partial.status, "partial");
    assert.equal(partial.issueNumber, 8);
    const raw = JSON.parse(readFileSync(path.join(dataDir, "tasks.json"), "utf8"))[0];
    assert.equal(raw.githubLinkReservation.state, "partial");
    assert.equal(typeof raw._githubLinkReservationId, "string");
    assert.equal(Object.hasOwn(partial.task, "_githubLinkReservationId"), false);
    const recovered = await instance.linkGithubIssue("p", "t");
    assert.equal(recovered.status, "linked");
    assert.equal(creates, 1);
    const final = JSON.parse(readFileSync(path.join(dataDir, "tasks.json"), "utf8"))[0];
    assert.equal(final.githubLinkReservation, undefined);
    assert.equal(final.githubSynchronization.state, "synced");
  } finally {
    rmSync(outDir, { recursive: true, force: true });
    rmSync(dataDir, { recursive: true, force: true });
  }
});

test("uncertain links can attach a verified issue, sync status, and delete locally afterward", async () => {
  const dataDir = storage();
  writeFileSync(
    path.join(dataDir, "projects.json"),
    JSON.stringify([{ id: "p", name: "Project", githubUrl: "https://github.com/acme/app" }])
  );
  const { workflow, outDir } = loadWorkflow(dataDir);
  try {
    const adapter = {
      createIssue: async () => {
        throw new Error("network timeout");
      },
      mirrorStatus: async (task) => assert.equal(task.status, "todo"),
    };
    const instance = new workflow.TaskWorkflow({
      githubAdapter: adapter,
      githubLinkAdapter: adapter,
    });
    const task = await instance.createTask({ projectId: "p", title: "Recover" });
    const uncertain = await instance.linkGithubIssue("p", task.id);
    assert.equal(uncertain.status, "uncertain");
    const attached = await instance.resolveGithubLink("p", task.id, {
      action: "attach",
      issueNumber: 42,
      issueUrl: "https://github.com/acme/app/issues/42",
    });
    assert.equal(attached.task.githubIssueNumber, 42);
    assert.equal(attached.task.githubLinkReservation, undefined);
    assert.equal(attached.task.githubSynchronization.state, "synced");
    await instance.deleteTask("p", task.id);
    assert.equal(JSON.parse(readFileSync(path.join(dataDir, "tasks.json"), "utf8")).length, 0);
  } finally {
    rmSync(outDir, { recursive: true, force: true });
    rmSync(dataDir, { recursive: true, force: true });
  }
});

test("confirming an uncertain link is empty clears it and permits a fresh link", async () => {
  const dataDir = storage();
  const { workflow, outDir } = loadWorkflow(dataDir);
  try {
    let creates = 0;
    const adapter = {
      createIssue: async () => {
        creates += 1;
        if (creates === 1) throw new Error("network timeout");
        return {
          number: 9,
          html_url: "https://github.com/acme/app/issues/9",
          title: "T",
          body: "",
          state: "open",
          labels: [],
        };
      },
      mirrorStatus: async () => undefined,
    };
    const instance = new workflow.TaskWorkflow({
      githubAdapter: adapter,
      githubLinkAdapter: adapter,
    });
    const task = await instance.createTask({ projectId: "p", title: "Recover" });
    const uncertain = await instance.linkGithubIssue("p", task.id);
    assert.equal(uncertain.status, "uncertain");
    await assert.rejects(
      () => instance.deleteTask("p", task.id),
      (error) => error.code === "github_link_conflict"
    );
    const cleared = await instance.resolveGithubLink("p", task.id, { action: "confirm-none" });
    assert.equal(cleared.resolution, "cleared");
    const linked = await instance.linkGithubIssue("p", task.id);
    assert.equal(linked.status, "linked");
    assert.equal(creates, 2);
  } finally {
    rmSync(outDir, { recursive: true, force: true });
    rmSync(dataDir, { recursive: true, force: true });
  }
});
