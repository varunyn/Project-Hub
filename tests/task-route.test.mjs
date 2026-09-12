import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

const require = createRequire(import.meta.url);
const projectRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");

function compileRoute(dataDir) {
  const outDir = mkdtempSync(path.join(tmpdir(), "project-hub-route-tsc-"));
  process.env.PROJECT_DATA_DIR = dataDir;
  execFileSync(
    "pnpm",
    [
      "exec",
      "tsc",
      "--ignoreConfig",
      "app/api/projects/[id]/tasks/route.ts",
      "app/api/projects/[id]/tasks/[taskId]/route.ts",
      "app/api/projects/[id]/tasks/[taskId]/github/status/retry/route.ts",
      "app/api/projects/[id]/tasks/[taskId]/github/route.ts",
      "app/api/projects/[id]/tasks/[taskId]/github/resolve/route.ts",
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
  symlinkSync(path.join(projectRoot, "node_modules"), path.join(outDir, "node_modules"), "dir");
  return {
    route: require(path.join(outDir, "api/projects/[id]/tasks/route.js")),
    taskRoute: require(path.join(outDir, "api/projects/[id]/tasks/[taskId]/route.js")),
    retryRoute: require(
      path.join(outDir, "api/projects/[id]/tasks/[taskId]/github/status/retry/route.js")
    ),
    githubRoute: require(path.join(outDir, "api/projects/[id]/tasks/[taskId]/github/route.js")),
    resolveRoute: require(
      path.join(outDir, "api/projects/[id]/tasks/[taskId]/github/resolve/route.js")
    ),
    outDir,
  };
}

test("web POST adapter preserves its response convention while using workflow creation", async () => {
  const dataDir = mkdtempSync(path.join(tmpdir(), "project-hub-route-"));
  writeFileSync(
    path.join(dataDir, "projects.json"),
    JSON.stringify([{ id: "p", name: "Project" }])
  );
  writeFileSync(path.join(dataDir, "tasks.json"), "[]");
  const { route, outDir } = compileRoute(dataDir);
  try {
    const response = await route.POST(
      { json: async () => ({ title: "  Web task  ", status: "review", priority: "high" }) },
      { params: Promise.resolve({ id: "p" }) }
    );
    assert.equal(response.status, 201);
    const created = await response.json();
    assert.deepEqual(
      {
        projectId: "p",
        title: "Web task",
        description: "",
        status: "review",
        priority: "high",
        assigneeId: "",
        labels: [],
        dueDate: "",
        position: 0,
      },
      {
        projectId: created.projectId,
        title: created.title,
        description: created.description,
        status: created.status,
        priority: created.priority,
        assigneeId: created.assigneeId,
        labels: created.labels,
        dueDate: created.dueDate,
        position: created.position,
      }
    );
    assert.match(created.id, /^[0-9a-f-]{36}$/);
    assert.match(created.createdAt, /^\d{4}-\d{2}-\d{2}T/);
    assert.equal(created.updatedAt, created.createdAt);
    const stored = JSON.parse(readFileSync(path.join(dataDir, "tasks.json"), "utf8"));
    assert.equal(stored[0].title, "Web task");
    assert.equal(stored[0].status, "review");
    assert.equal(stored[0].priority, "high");
  } finally {
    rmSync(outDir, { recursive: true, force: true });
    rmSync(dataDir, { recursive: true, force: true });
  }
});

test("web POST adapter retains project-not-found and invalid-task conventions", async () => {
  const dataDir = mkdtempSync(path.join(tmpdir(), "project-hub-route-"));
  writeFileSync(
    path.join(dataDir, "projects.json"),
    JSON.stringify([{ id: "p", name: "Project" }])
  );
  writeFileSync(path.join(dataDir, "tasks.json"), "[]");
  const { route, outDir } = compileRoute(dataDir);
  try {
    const missingProject = await route.POST(
      { json: async () => ({ title: "Task" }) },
      { params: Promise.resolve({ id: "missing" }) }
    );
    assert.equal(missingProject.status, 404);
    assert.deepEqual(await missingProject.json(), { error: "Project not found" });
    const invalid = await route.POST(
      { json: async () => ({ title: "   " }) },
      { params: Promise.resolve({ id: "p" }) }
    );
    assert.equal(invalid.status, 400);
    assert.deepEqual(await invalid.json(), { error: "Invalid task" });
    assert.deepEqual(JSON.parse(readFileSync(path.join(dataDir, "tasks.json"), "utf8")), []);
  } finally {
    rmSync(outDir, { recursive: true, force: true });
    rmSync(dataDir, { recursive: true, force: true });
  }
});

test("web PATCH and DELETE preserve transport responses while using the workflow", async () => {
  const dataDir = mkdtempSync(path.join(tmpdir(), "project-hub-route-"));
  writeFileSync(
    path.join(dataDir, "projects.json"),
    JSON.stringify([{ id: "p", name: "Project" }])
  );
  writeFileSync(
    path.join(dataDir, "tasks.json"),
    JSON.stringify([
      {
        id: "t1",
        projectId: "p",
        title: "One",
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
    ])
  );
  const { taskRoute, outDir } = compileRoute(dataDir);
  try {
    const updated = await taskRoute.PATCH(
      { json: async () => ({ title: "Renamed" }) },
      { params: Promise.resolve({ id: "p", taskId: "t1" }) }
    );
    assert.equal(updated.status, 200);
    assert.equal((await updated.json()).title, "Renamed");

    const invalid = await taskRoute.PATCH(
      { json: async () => ({}) },
      { params: Promise.resolve({ id: "p", taskId: "t1" }) }
    );
    assert.equal(invalid.status, 400);
    assert.deepEqual(await invalid.json(), { error: "Invalid task changes" });

    const missingProject = await taskRoute.PATCH(
      { json: async () => ({ title: "Nope" }) },
      { params: Promise.resolve({ id: "missing", taskId: "t1" }) }
    );
    assert.equal(missingProject.status, 404);
    assert.deepEqual(await missingProject.json(), { error: "Project not found" });

    const missingTask = await taskRoute.DELETE(
      {},
      { params: Promise.resolve({ id: "p", taskId: "missing" }) }
    );
    assert.equal(missingTask.status, 404);
    assert.deepEqual(await missingTask.json(), { error: "Task not found" });

    const deleted = await taskRoute.DELETE(
      {},
      { params: Promise.resolve({ id: "p", taskId: "t1" }) }
    );
    assert.equal(deleted.status, 200);
    assert.deepEqual(await deleted.json(), { deleted: true });
  } finally {
    rmSync(outDir, { recursive: true, force: true });
    rmSync(dataDir, { recursive: true, force: true });
  }
});

test("compiled web PATCH commits a linked status locally when GitHub is unavailable", async () => {
  const dataDir = mkdtempSync(path.join(tmpdir(), "project-hub-route-linked-"));
  writeFileSync(
    path.join(dataDir, "projects.json"),
    JSON.stringify([{ id: "p", name: "Project", githubUrl: "https://github.com/a/r" }])
  );
  writeFileSync(
    path.join(dataDir, "tasks.json"),
    JSON.stringify([
      {
        id: "t1",
        projectId: "p",
        title: "One",
        description: "",
        status: "todo",
        priority: "medium",
        assigneeId: "",
        labels: [],
        dueDate: "",
        position: 0,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        githubIssueNumber: 4,
      },
    ])
  );
  const { taskRoute, outDir } = compileRoute(dataDir);
  const originalToken = process.env.GITHUB_TOKEN;
  delete process.env.GITHUB_TOKEN;
  try {
    const response = await taskRoute.PATCH(
      { json: async () => ({ status: "in-progress" }) },
      { params: Promise.resolve({ id: "p", taskId: "t1" }) }
    );
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.status, "in-progress");
    assert.equal(body.githubSynchronization.state, "failed");
    assert.equal(body.githubSynchronization.error, "GitHub synchronization is not configured");
    assert.equal(Object.hasOwn(body, "githubSynchronizationOutcome"), false);
    assert.equal(Object.hasOwn(body, "_githubSyncAttemptId"), false);
    const stored = JSON.parse(readFileSync(path.join(dataDir, "tasks.json"), "utf8"))[0];
    assert.deepEqual(stored, { ...stored, status: "in-progress" });
    assert.equal(stored.githubSynchronization.state, "failed");
    assert.equal(Object.hasOwn(stored, "_githubSyncAttemptId"), false);
  } finally {
    if (originalToken === undefined) delete process.env.GITHUB_TOKEN;
    else process.env.GITHUB_TOKEN = originalToken;
    rmSync(outDir, { recursive: true, force: true });
    rmSync(dataDir, { recursive: true, force: true });
  }
});

test("web retry translates a linked synchronization failure and preserves the current Task", async () => {
  const dataDir = mkdtempSync(path.join(tmpdir(), "project-hub-route-retry-"));
  writeFileSync(
    path.join(dataDir, "projects.json"),
    JSON.stringify([{ id: "p", name: "Project", githubUrl: "https://github.com/a/r" }])
  );
  writeFileSync(
    path.join(dataDir, "tasks.json"),
    JSON.stringify([
      {
        id: "t1",
        projectId: "p",
        title: "One",
        description: "",
        status: "review",
        priority: "medium",
        assigneeId: "",
        labels: [],
        dueDate: "",
        position: 0,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        githubIssueNumber: 4,
        githubSynchronization: {
          state: "failed",
          attemptedAt: "old",
          error: "GitHub synchronization failed",
        },
      },
    ])
  );
  const { retryRoute, outDir } = compileRoute(dataDir);
  const originalToken = process.env.GITHUB_TOKEN;
  delete process.env.GITHUB_TOKEN;
  try {
    const response = await retryRoute.POST(
      {},
      { params: Promise.resolve({ id: "p", taskId: "t1" }) }
    );
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.task.status, "review");
    assert.equal(body.task.githubSynchronization.state, "failed");
    assert.equal(body.githubSynchronization.status, "failed");
    assert.equal(body.githubSynchronization.error, "GitHub synchronization is not configured");
  } finally {
    if (originalToken === undefined) delete process.env.GITHUB_TOKEN;
    else process.env.GITHUB_TOKEN = originalToken;
    rmSync(outDir, { recursive: true, force: true });
    rmSync(dataDir, { recursive: true, force: true });
  }
});

test("GitHub link route translates already-linked, reservation conflict, and definite HTTP failure", async () => {
  const dataDir = mkdtempSync(path.join(tmpdir(), "project-hub-route-link-"));
  writeFileSync(
    path.join(dataDir, "projects.json"),
    JSON.stringify([{ id: "p", name: "P", githubUrl: "https://github.com/a/r" }])
  );
  writeFileSync(
    path.join(dataDir, "tasks.json"),
    JSON.stringify([
      {
        id: "linked",
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
        githubIssueUrl: "https://github.com/a/r/issues/3",
      },
    ])
  );
  const { githubRoute, outDir } = compileRoute(dataDir);
  const originalToken = process.env.GITHUB_TOKEN;
  const originalFetch = globalThis.fetch;
  process.env.GITHUB_TOKEN = "test-token";
  try {
    delete process.env.GITHUB_TOKEN;
    const already = await githubRoute.POST(
      {},
      { params: Promise.resolve({ id: "p", taskId: "linked" }) }
    );
    assert.equal(already.status, 200);
    assert.equal((await already.json()).githubIssueNumber, 3);
    process.env.GITHUB_TOKEN = "test-token";
    const raw = JSON.parse(readFileSync(path.join(dataDir, "tasks.json"), "utf8"));
    raw[0].githubIssueNumber = undefined;
    raw[0].githubIssueUrl = undefined;
    raw[0].githubLinkReservation = { state: "creating", reservedAt: "x" };
    writeFileSync(path.join(dataDir, "tasks.json"), JSON.stringify(raw));
    const conflict = await githubRoute.POST(
      {},
      { params: Promise.resolve({ id: "p", taskId: "linked" }) }
    );
    assert.equal(conflict.status, 409);
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ message: "invalid" }), { status: 422 });
    raw[0].githubLinkReservation = undefined;
    writeFileSync(path.join(dataDir, "tasks.json"), JSON.stringify(raw));
    const failed = await githubRoute.POST(
      {},
      { params: Promise.resolve({ id: "p", taskId: "linked" }) }
    );
    assert.equal(failed.status, 502);
    assert.equal((await failed.json()).status, "failed");
    assert.equal(
      JSON.parse(readFileSync(path.join(dataDir, "tasks.json"), "utf8"))[0].githubLinkReservation,
      undefined
    );
  } finally {
    globalThis.fetch = originalFetch;
    if (originalToken === undefined) delete process.env.GITHUB_TOKEN;
    else process.env.GITHUB_TOKEN = originalToken;
    rmSync(outDir, { recursive: true, force: true });
    rmSync(dataDir, { recursive: true, force: true });
  }
});

test("GitHub link route preserves legacy configuration responses", async () => {
  const dataDir = mkdtempSync(path.join(tmpdir(), "project-hub-route-config-"));
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
      },
    ])
  );
  const { githubRoute, outDir } = compileRoute(dataDir);
  const originalToken = process.env.GITHUB_TOKEN;
  try {
    process.env.GITHUB_TOKEN = "test-token";
    const missingRepository = await githubRoute.POST(
      {},
      { params: Promise.resolve({ id: "p", taskId: "t" }) }
    );
    assert.equal(missingRepository.status, 400);
    const projects = JSON.parse(readFileSync(path.join(dataDir, "projects.json"), "utf8"));
    projects[0].githubUrl = "https://github.com/a/r";
    writeFileSync(path.join(dataDir, "projects.json"), JSON.stringify(projects));
    delete process.env.GITHUB_TOKEN;
    const missingToken = await githubRoute.POST(
      {},
      { params: Promise.resolve({ id: "p", taskId: "t" }) }
    );
    assert.equal(missingToken.status, 503);
  } finally {
    if (originalToken === undefined) delete process.env.GITHUB_TOKEN;
    else process.env.GITHUB_TOKEN = originalToken;
    rmSync(outDir, { recursive: true, force: true });
    rmSync(dataDir, { recursive: true, force: true });
  }
});

test("GitHub link resolution route attaches verified issues and rejects invalid or missing reservations", async () => {
  const dataDir = mkdtempSync(path.join(tmpdir(), "project-hub-resolve-route-"));
  writeFileSync(
    path.join(dataDir, "projects.json"),
    JSON.stringify([{ id: "p", name: "Project", githubUrl: "https://github.com/acme/app" }])
  );
  writeFileSync(
    path.join(dataDir, "tasks.json"),
    JSON.stringify([
      {
        id: "t",
        projectId: "p",
        title: "Recover",
        description: "",
        status: "todo",
        priority: "medium",
        assigneeId: "",
        labels: [],
        dueDate: "",
        position: 0,
        createdAt: "x",
        updatedAt: "x",
        githubLinkReservation: { state: "uncertain", reservedAt: "x" },
        _githubLinkReservationId: "r",
      },
    ])
  );
  const { resolveRoute, outDir } = compileRoute(dataDir);
  try {
    const invalid = await resolveRoute.POST(
      {
        json: async () => ({
          action: "attach",
          issueNumber: 42,
          issueUrl: "https://github.com/other/repo/issues/42",
        }),
      },
      { params: Promise.resolve({ id: "p", taskId: "t" }) }
    );
    assert.equal(invalid.status, 400);
    const attached = await resolveRoute.POST(
      {
        json: async () => ({
          action: "attach",
          issueNumber: 42,
          issueUrl: "https://github.com/acme/app/issues/42",
        }),
      },
      { params: Promise.resolve({ id: "p", taskId: "t" }) }
    );
    assert.equal(attached.status, 200);
    assert.equal((await attached.json()).task.githubIssueNumber, 42);
    const missing = await resolveRoute.POST(
      { json: async () => ({ action: "confirm-none" }) },
      { params: Promise.resolve({ id: "p", taskId: "t" }) }
    );
    assert.equal(missing.status, 409);
  } finally {
    rmSync(outDir, { recursive: true, force: true });
    rmSync(dataDir, { recursive: true, force: true });
  }
});
