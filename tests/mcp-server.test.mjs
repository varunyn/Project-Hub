import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const serverPath = fileURLToPath(new URL("../mcp/dist/mcp/server.js", import.meta.url));

function startServer(dataDir, cwd, extraEnv = {}) {
  const child = spawn(process.execPath, [serverPath], {
    cwd,
    env: {
      ...process.env,
      PROJECT_DATA_DIR: dataDir,
      ...extraEnv,
    },
    stdio: ["pipe", "pipe", "pipe"],
  });
  let buffer = "";
  const pending = new Map();
  let stopped = false;
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });
  child.stdout.on("data", (chunk) => {
    buffer += chunk;
    const lines = buffer.split("\n");
    buffer = lines.pop();
    for (const line of lines.filter(Boolean)) {
      try {
        const message = JSON.parse(line);
        const request = pending.get(message.id);
        if (request) {
          clearTimeout(request.timeout);
          pending.delete(message.id);
          request.resolve(message);
        }
      } catch (error) {
        for (const request of pending.values()) {
          clearTimeout(request.timeout);
          request.reject(error);
        }
        pending.clear();
      }
    }
  });
  const rejectPending = (error) => {
    for (const request of pending.values()) {
      clearTimeout(request.timeout);
      request.reject(error);
    }
    pending.clear();
  };
  child.once("error", rejectPending);
  child.once("exit", (code, signal) => {
    if (!stopped)
      rejectPending(new Error(`MCP server exited (${code ?? signal}): ${stderr.trim()}`));
  });

  let nextId = 1;
  return {
    request(method, params = {}) {
      const id = nextId++;
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          if (pending.delete(id)) reject(new Error(`Timed out waiting for MCP response ${id}`));
        }, 5000);
        pending.set(id, { resolve, reject, timeout });
        child.stdin.write(
          `${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`,
          (error) => {
            if (error && pending.delete(id)) {
              clearTimeout(timeout);
              reject(error);
            }
          }
        );
      });
    },
    notify(method, params = {}) {
      child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method, params })}\n`);
    },
    async stop() {
      stopped = true;
      rejectPending(new Error("MCP server stopped"));
      if (child.exitCode !== null || child.signalCode !== null) return;
      await new Promise((resolve) => {
        const timeout = setTimeout(() => {
          child.kill("SIGKILL");
          resolve();
        }, 1000);
        child.once("exit", () => {
          clearTimeout(timeout);
          resolve();
        });
        child.kill();
      });
    },
  };
}

async function initializeServer(server) {
  const initialized = await server.request("initialize", {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "test", version: "1.0.0" },
  });
  assert.equal(initialized.result.serverInfo.name, "Project Hub");
  server.notify("notifications/initialized");
}

async function createTestStorage(projects) {
  const dataDir = await mkdtemp(join(tmpdir(), "project-hub-mcp-test-"));
  const cwd = await mkdtemp(join(tmpdir(), "project-hub-mcp-cwd-"));
  await writeFile(join(dataDir, "projects.json"), JSON.stringify(projects));
  await writeFile(join(dataDir, "tasks.json"), "[]");
  return { dataDir, cwd };
}

function decodeTool(response) {
  assert.equal(response.result.isError, undefined);
  return JSON.parse(response.result.content[0].text);
}

async function withServer(projects, callback, { report } = {}) {
  const { dataDir, cwd } = await createTestStorage(projects);
  const reportDir = report ? await mkdtemp(join(tmpdir(), "project-hub-mcp-report-")) : undefined;
  if (report) await writeFile(join(reportDir, report.name), JSON.stringify(report.value));
  const server = startServer(
    dataDir,
    cwd,
    reportDir ? { DEPENDENCY_REPORT_OUTPUT_DIR: reportDir } : {}
  );
  try {
    await initializeServer(server);
    return await callback(server, { dataDir, reportDir });
  } finally {
    await server.stop();
    await Promise.all([
      rm(dataDir, { recursive: true, force: true }),
      rm(cwd, { recursive: true, force: true }),
      reportDir ? rm(reportDir, { recursive: true, force: true }) : Promise.resolve(),
    ]);
  }
}

const projects = [
  {
    id: "alpha",
    name: "Alpha",
    path: "/workspace/alpha",
    techStack: ["Python"],
    dateCreated: "2026-01-01",
    lastUpdated: "2026-01-01",
    readmePreview: "",
    status: "in progress",
  },
  {
    id: "beta",
    name: "Beta",
    path: "/workspace/beta",
    techStack: ["Node"],
    dateCreated: "2026-01-01",
    lastUpdated: "2026-01-01",
    readmePreview: "",
    status: "completed",
  },
];

const tasks = [
  {
    id: "a1",
    projectId: "alpha",
    title: "Ship API",
    description: "Finish API",
    status: "todo",
    priority: "high",
    assigneeId: "",
    labels: ["api"],
    dueDate: "",
    position: 0,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  },
  {
    id: "a2",
    projectId: "alpha",
    title: "Write docs",
    description: "Document workflow",
    status: "done",
    priority: "low",
    assigneeId: "",
    labels: ["docs"],
    dueDate: "",
    position: 0,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-02T00:00:00Z",
  },
  {
    id: "b1",
    projectId: "beta",
    title: "Review release",
    description: "Review release",
    status: "review",
    priority: "medium",
    assigneeId: "",
    labels: ["release"],
    dueDate: "",
    position: 0,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-03T00:00:00Z",
  },
];

async function seedTasks(dataDir, values = tasks) {
  await writeFile(join(dataDir, "tasks.json"), JSON.stringify(values));
}

test("compiled MCP server initializes from an absolute path outside the repository", async () => {
  const { dataDir, cwd } = await createTestStorage([
    {
      id: "one",
      name: "One",
      path: "/tmp/one",
      techStack: [],
      dateCreated: "2026-01-01",
      lastUpdated: "2026-01-01",
      readmePreview: "",
      status: "in progress",
    },
  ]);
  const server = startServer(dataDir, cwd);
  try {
    await initializeServer(server);
    const tools = await server.request("tools/list");
    const names = tools.result.tools.map((tool) => tool.name);
    assert.ok(names.includes("list_projects"));
    assert.ok(names.includes("create_task"));
    const projects = await server.request("tools/call", { name: "list_projects", arguments: {} });
    assert.match(projects.result.content[0].text, /"name": "One"/);
  } finally {
    await server.stop();
    await Promise.all([
      rm(dataDir, { recursive: true, force: true }),
      rm(cwd, { recursive: true, force: true }),
    ]);
  }
});

test("update_project preserves omitted fields in the response and projects.json", async () => {
  const project = {
    id: "one",
    name: "Original",
    path: "/tmp/one",
    techStack: ["TypeScript", "Next.js"],
    dateCreated: "2026-01-01",
    lastUpdated: "2026-01-01",
    readmePreview: "Original preview",
    status: "in progress",
    url: "https://example.com/one",
    githubUrl: "https://github.com/example/one",
  };
  const { dataDir, cwd } = await createTestStorage([project]);
  const server = startServer(dataDir, cwd);
  try {
    await initializeServer(server);
    const response = await server.request("tools/call", {
      name: "update_project",
      arguments: { project_id: project.id, name: "Renamed" },
    });
    const returnedProject = JSON.parse(response.result.content[0].text);
    const persistedProjects = JSON.parse(await readFile(join(dataDir, "projects.json"), "utf8"));
    const expected = { ...project, name: "Renamed", lastUpdated: returnedProject.lastUpdated };
    assert.deepEqual(returnedProject, expected);
    assert.deepEqual(persistedProjects, [expected]);
  } finally {
    await server.stop();
    await Promise.all([
      rm(dataDir, { recursive: true, force: true }),
      rm(cwd, { recursive: true, force: true }),
    ]);
  }
});

test("task and project tools preserve scope and workflow semantics", async () => {
  await withServer(projects, async (server, { dataDir }) => {
    await seedTasks(dataDir);
    assert.deepEqual(
      decodeTool(
        await server.request("tools/call", {
          name: "search_projects",
          arguments: { query: "alpha", tech: "python" },
        })
      ).map((p) => p.id),
      ["alpha"]
    );
    assert.deepEqual(
      decodeTool(
        await server.request("tools/call", {
          name: "list_tasks",
          arguments: { project_id: "alpha", status: "todo", priority: "high", query: "api" },
        })
      ).map((task) => task.id),
      ["a1"]
    );
    assert.deepEqual(
      decodeTool(
        await server.request("tools/call", { name: "get_task", arguments: { task_id: "a1" } })
      ),
      tasks[0]
    );

    const firstReview = decodeTool(
      await server.request("tools/call", {
        name: "create_task",
        arguments: {
          project_id: "alpha",
          title: "First review",
          status: "review",
          priority: "high",
        },
      })
    );
    const secondReview = decodeTool(
      await server.request("tools/call", {
        name: "create_task",
        arguments: { project_id: "alpha", title: "Second review", status: "review" },
      })
    );
    assert.equal(secondReview.position, 1);
    const moved = decodeTool(
      await server.request("tools/call", {
        name: "update_task",
        arguments: { task_id: secondReview.id, status: "review", position: 0 },
      })
    );
    assert.equal(moved.position, 0);
    assert.deepEqual(
      decodeTool(
        await server.request("tools/call", {
          name: "list_tasks",
          arguments: { project_id: "alpha", status: "review" },
        })
      ).map((task) => [task.id, task.position]),
      [
        [secondReview.id, 0],
        [firstReview.id, 1],
      ]
    );
    assert.equal(
      decodeTool(
        await server.request("tools/call", {
          name: "update_task",
          arguments: { task_id: "a1", project_id: "beta", title: "Must not change" },
        })
      ),
      null
    );
    assert.equal(
      decodeTool(
        await server.request("tools/call", {
          name: "delete_task",
          arguments: { task_id: firstReview.id },
        })
      ),
      true
    );
    assert.equal(
      decodeTool(
        await server.request("tools/call", {
          name: "get_task",
          arguments: { task_id: firstReview.id },
        })
      ),
      null
    );
  });
});

const dependencyReport = {
  generated_at: "2026-06-15",
  scan_roots: ["/workspace"],
  projects: [
    {
      path: "/workspace/alpha",
      ecosystems: ["python"],
      manifests: ["pyproject.toml"],
      warnings: ["old lockfile"],
      errors: [],
      updates: [
        {
          ecosystem: "python",
          package: "fastapi",
          current: "0.100.0",
          wanted: "",
          latest: "0.111.0",
          dependency_type: "uv.lock",
          release_info: {
            latest_release_date: "2026-06-10",
            ai_risk: "medium",
            ai_breaking_changes: ["Review lifespan changes"],
          },
        },
      ],
    },
    {
      path: "/workspace/beta",
      ecosystems: ["node"],
      manifests: ["package.json"],
      warnings: [],
      errors: ["npm unavailable"],
      updates: [],
    },
  ],
};

test("dependency tools report missing and ready fixtures", async () => {
  const { dataDir, cwd } = await createTestStorage(projects);
  const reportDir = await mkdtemp(join(tmpdir(), "project-hub-mcp-report-"));
  const server = startServer(dataDir, cwd, { DEPENDENCY_REPORT_OUTPUT_DIR: reportDir });
  try {
    await initializeServer(server);
    const missing = decodeTool(
      await server.request("tools/call", { name: "get_dependency_report", arguments: {} })
    );
    assert.equal(missing.status, "missing");
    assert.deepEqual(missing.projects, []);
    assert.deepEqual(
      decodeTool(
        await server.request("tools/call", {
          name: "search_dependency_updates",
          arguments: { package: "fast" },
        })
      ),
      { status: "missing", updates: [], report_file_name: null }
    );

    await writeFile(
      join(reportDir, "dependency-report-2026-06-15.json"),
      JSON.stringify(dependencyReport)
    );
    const report = decodeTool(
      await server.request("tools/call", { name: "get_dependency_report", arguments: {} })
    );
    assert.equal(report.status, "ready");
    assert.deepEqual(report.totals, { projects: 2, updates: 1, warnings: 1, errors: 1 });
    const scoped = decodeTool(
      await server.request("tools/call", {
        name: "get_project_dependency_updates",
        arguments: { project_id_or_path: "alpha" },
      })
    );
    assert.equal(scoped.status, "ready");
    assert.equal(scoped.updates[0].packageName, "fastapi");
    const found = decodeTool(
      await server.request("tools/call", {
        name: "search_dependency_updates",
        arguments: { package: "FAST", risk: "medium", project: "alpha" },
      })
    );
    assert.equal(found.updates.length, 1);
    assert.equal(found.updates[0].project.id, "alpha");
  } finally {
    await server.stop();
    await Promise.all([
      rm(dataDir, { recursive: true, force: true }),
      rm(cwd, { recursive: true, force: true }),
      rm(reportDir, { recursive: true, force: true }),
    ]);
  }
});

test("resources and prompt expose protocol contracts", async () => {
  await withServer(
    projects,
    async (server) => {
      const resources = await server.request("resources/list");
      const uris = resources.result.resources.map((resource) => resource.uri);
      assert.ok(uris.includes("project-hub://projects"));
      assert.ok(uris.includes("project-hub://tasks"));
      assert.ok(uris.includes("project-hub://dependency-report/latest"));
      const read = async (uri) =>
        JSON.parse((await server.request("resources/read", { uri })).result.contents[0].text);
      assert.deepEqual(await read("project-hub://projects"), projects);
      assert.deepEqual(await read("project-hub://tasks"), []);
      assert.deepEqual(await read("project-hub://projects/alpha/tasks"), []);
      assert.equal((await read("project-hub://dependency-report/latest")).status, "ready");
      assert.equal(
        (await read("project-hub://projects/alpha/dependency-updates")).updates[0].packageName,
        "fastapi"
      );
      const prompt = await server.request("prompts/get", {
        name: "review_dependency_update_prompt",
        arguments: { package_name: "fastapi", project_id_or_path: "alpha" },
      });
      const promptText = prompt.result.messages[0].content.text;
      assert.match(promptText, /get_project_dependency_updates/);
      assert.match(promptText, /current, wanted, and latest versions/);
      assert.match(promptText, /AI risk and priority/);
      assert.match(promptText, /safest next action/);
    },
    { report: { name: "dependency-report-2026-06-15.json", value: dependencyReport } }
  );
});
