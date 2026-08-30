import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Project, ProjectTask, TaskPriority, TaskStatus } from "../app/types";
import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

type DependencyProject = import("../app/lib/dependencyReport").DependencyProject;

function findRepositoryRoot(startDirectory: string): string {
  let directory = path.resolve(startDirectory);
  while (true) {
    try {
      const packageJson = JSON.parse(
        fs.readFileSync(path.join(directory, "package.json"), "utf8")
      ) as { name?: string };
      if (packageJson.name === "project-hub") return directory;
    } catch {
      // Continue looking through parent directories.
    }

    const parent = path.dirname(directory);
    if (parent === directory) {
      throw new Error("Could not locate the Project Hub repository root");
    }
    directory = parent;
  }
}

const repositoryRoot = findRepositoryRoot(path.dirname(fileURLToPath(import.meta.url)));
const packageJson = JSON.parse(
  fs.readFileSync(path.join(repositoryRoot, "package.json"), "utf8")
) as { version?: string };

const originalWorkingDirectory = process.cwd();
let readLatestDependencyReport: typeof import("../app/lib/dependencyReport").readLatestDependencyReport;
let addProject: typeof import("../app/utils/projectUtils").addProject;
let deleteProject: typeof import("../app/utils/projectUtils").deleteProject;
let getProjects: typeof import("../app/utils/projectUtils").getProjects;
let updateProject: typeof import("../app/utils/projectUtils").updateProject;
let resolveProjectPathForServer: typeof import("../app/utils/projectUtils").resolveProjectPathForServer;
let createTask: typeof import("../app/utils/taskUtils").createTask;
let deleteTask: typeof import("../app/utils/taskUtils").deleteTask;
let getAllTasks: typeof import("../app/utils/taskUtils").getAllTasks;
let getProjectTasks: typeof import("../app/utils/taskUtils").getProjectTasks;
let getTasks: typeof import("../app/utils/taskUtils").getTasks;
let TASK_PRIORITIES: typeof import("../app/utils/taskUtils").TASK_PRIORITIES;
let TASK_STATUSES: typeof import("../app/utils/taskUtils").TASK_STATUSES;
let updateTask: typeof import("../app/utils/taskUtils").updateTask;

try {
  process.chdir(repositoryRoot);
  ({ readLatestDependencyReport } = await import("../app/lib/dependencyReport.js"));
  ({
    addProject,
    deleteProject,
    getProjects,
    updateProject,
    resolveProjectPathForServer,
  } = await import("../app/utils/projectUtils.js"));
  ({
    createTask,
    deleteTask,
    getAllTasks,
    getProjectTasks,
    getTasks,
    TASK_PRIORITIES,
    TASK_STATUSES,
    updateTask,
  } = await import("../app/utils/taskUtils.js"));
} finally {
  process.chdir(originalWorkingDirectory);
}

const server = new McpServer({
  name: "Project Hub",
  version: packageJson.version ?? "0.0.0",
}, {
  instructions:
    "Query, add, and update projects and project tasks in Project Hub. Data is stored in app/data/projects.json and app/data/tasks.json.",
});

const readOnly = { readOnlyHint: true, openWorldHint: false } as const;
const destructive = { destructiveHint: true } as const;
const result = (value: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
});

const statusSchema = z.enum(TASK_STATUSES as [TaskStatus, ...TaskStatus[]]);
const prioritySchema = z.enum(TASK_PRIORITIES as [TaskPriority, ...TaskPriority[]]);
const projectStatusSchema = z.enum(["in progress", "completed", "archived"]);

function findProject(idOrPath: string): Project | undefined {
  return getProjects().find((project) => project.id === idOrPath || project.path === idOrPath);
}

function findTask(taskId: string): ProjectTask | undefined {
  return getTasks().find((task) => task.id === taskId);
}

function matchesDependencyProject(
  item: DependencyProject,
  project: Project | undefined,
  idOrPath: string
): boolean {
  return (
    item.path === idOrPath ||
    item.path === project?.path ||
    item.path === (project ? resolveProjectPathForServer(project.path) : undefined)
  );
}

async function dependencyReport() {
  return readLatestDependencyReport();
}

server.registerTool("list_projects", {
  title: "List Projects",
  description: "List all projects in the tracker.",
  annotations: readOnly,
}, async () => result(getProjects()));

server.registerTool("get_project", {
  title: "Get Project",
  description: "Get a single project by ID.",
  inputSchema: { project_id: z.string() },
  annotations: readOnly,
}, async ({ project_id }) => result(getProjects().find((project) => project.id === project_id) ?? null));

server.registerTool("search_projects", {
  title: "Search Projects",
  description: "Search projects by name/path, status, or technology stack.",
  inputSchema: {
    query: z.string().optional(),
    status: z.string().optional(),
    tech: z.string().optional(),
  },
  annotations: readOnly,
}, async ({ query = "", status = "", tech = "" }) => {
  const q = query.toLowerCase();
  const st = status.toLowerCase();
  const te = tech.toLowerCase();
  return result(getProjects().filter((project) =>
    (!q || project.name.toLowerCase().includes(q) || project.path.toLowerCase().includes(q)) &&
    (!st || project.status.toLowerCase() === st) &&
    (!te || project.techStack.some((item) => item.toLowerCase() === te))
  ));
});

server.registerTool("list_tasks", {
  title: "List Tasks",
  description: "List tasks with optional project, status, priority, and text filters.",
  inputSchema: {
    project_id: z.string().optional(),
    status: z.string().optional(),
    priority: z.string().optional(),
    query: z.string().optional(),
  },
  annotations: readOnly,
}, async ({ project_id, status, priority, query = "" }) => {
  const q = query.toLowerCase();
  return result(getAllTasks().filter((task) =>
    (!project_id || task.projectId === project_id) &&
    (!status || task.status === status) &&
    (!priority || task.priority === priority) &&
    (!q || [task.title, task.description, ...task.labels].join(" ").toLowerCase().includes(q))
  ));
});

server.registerTool("get_task", {
  title: "Get Task",
  description: "Get one task by ID.",
  inputSchema: { task_id: z.string() },
  annotations: readOnly,
}, async ({ task_id }) => result(findTask(task_id) ?? null));

server.registerTool("get_dependency_report", {
  title: "Get Dependency Report",
  description: "Get the latest dependency tracker report.",
  annotations: readOnly,
}, async () => result(await dependencyReport()));

server.registerTool("get_project_dependency_updates", {
  title: "Get Project Dependency Updates",
  description: "Get dependency updates for a project ID or path.",
  inputSchema: { project_id_or_path: z.string() },
  annotations: readOnly,
}, async ({ project_id_or_path }) => {
  const project = findProject(project_id_or_path);
  const report = await dependencyReport();
  const dependencyProject = report.projects.find((item) =>
    matchesDependencyProject(item, project, project_id_or_path)
  );
  return result({
    status: report.status === "missing" ? "missing" : dependencyProject ? "ready" : "not_found",
    project: project ?? null,
    dependency_project: dependencyProject ?? null,
    updates: dependencyProject?.updates ?? [],
    report_file_name: report.reportFileName,
  });
});

server.registerTool("search_dependency_updates", {
  title: "Search Dependency Updates",
  description: "Search dependency updates by package, ecosystem, project, or AI risk.",
  inputSchema: {
    package: z.string().optional(), ecosystem: z.string().optional(), project: z.string().optional(), risk: z.string().optional(),
  },
  annotations: readOnly,
}, async ({ package: packageQuery = "", ecosystem = "", project: projectQuery = "", risk = "" }) => {
  const report = await dependencyReport();
  if (report.status === "missing") {
    return result({ status: "missing", updates: [], report_file_name: null });
  }
  const packageLower = packageQuery.toLowerCase();
  const ecosystemLower = ecosystem.toLowerCase();
  const projectLower = projectQuery.toLowerCase();
  const riskLower = risk.toLowerCase();
  const projects = getProjects();
  const updates = report.projects.flatMap((dependencyProject) => {
    const trackedProject = projects.find((item) => item.path === dependencyProject.path);
    const projectPathMatches = dependencyProject.path.toLowerCase().includes(projectLower);
    const projectMetadataMatches = trackedProject &&
      [trackedProject.id, trackedProject.name].some((value) => value.toLowerCase().includes(projectLower));
    if (projectQuery && !projectPathMatches && !projectMetadataMatches) return [];
    return dependencyProject.updates
      .filter((update) =>
        (!packageQuery || update.packageName.toLowerCase().includes(packageLower)) &&
        (!ecosystem || update.ecosystem.toLowerCase() === ecosystemLower) &&
        (!risk || update.releaseInfo.aiRisk?.toLowerCase() === riskLower)
      )
      .map((update) => ({ project_path: dependencyProject.path, project: trackedProject ?? null, ...update }));
  });
  return result({ status: "ready", updates, report_file_name: report.reportFileName, totals: { updates: updates.length } });
});

server.registerTool("create_task", {
  description: "Create a task in an existing project.",
  inputSchema: {
    project_id: z.string(), title: z.string().trim().min(1).max(200), description: z.string().max(5000).default(""), status: statusSchema.default("todo"),
    priority: prioritySchema.default("medium"), assignee_id: z.string().max(100).default(""), labels: z.array(z.string().max(40)).max(10).default([]), due_date: z.string().regex(/^$|^\d{4}-\d{2}-\d{2}$/).default(""),
  },
}, async ({ project_id, title, description, status, priority, assignee_id, labels, due_date }) => {
  if (!getProjects().some((project) => project.id === project_id)) return result(null);
  if (!title.trim()) throw new Error("title is required");
  const now = new Date().toISOString();
  const task: ProjectTask = {
    id: randomUUID(), projectId: project_id, title: title.trim(), description, status, priority,
    assigneeId: assignee_id, labels, dueDate: due_date,
    position: getProjectTasks(project_id).filter((item) => item.status === status).length,
    createdAt: now, updatedAt: now,
  };
  return result(await createTask(task));
});

server.registerTool("update_task", {
  description: "Update a task by ID.",
  inputSchema: {
    task_id: z.string(), project_id: z.string().optional(), title: z.string().trim().min(1).max(200).optional(), description: z.string().max(5000).optional(),
    status: statusSchema.optional(), priority: prioritySchema.optional(), assignee_id: z.string().max(100).optional(), labels: z.array(z.string().max(40)).max(10).optional(), due_date: z.string().regex(/^$|^\d{4}-\d{2}-\d{2}$/).optional(), position: z.number().int().min(0).optional(),
  },
}, async ({ task_id, project_id, title, description, status, priority, assignee_id, labels, due_date, position }) => {
  const task = findTask(task_id);
  if (!task || (project_id && task.projectId !== project_id)) return result(null);
  if (title !== undefined && !title.trim()) throw new Error("title cannot be empty");
  const changes: Partial<ProjectTask> = {};
  if (title !== undefined) changes.title = title.trim();
  if (description !== undefined) changes.description = description;
  if (status !== undefined) changes.status = status;
  if (priority !== undefined) changes.priority = priority;
  if (assignee_id !== undefined) changes.assigneeId = assignee_id;
  if (labels !== undefined) changes.labels = labels;
  if (due_date !== undefined) changes.dueDate = due_date;
  if (position !== undefined) changes.position = position;
  return result(await updateTask(task.projectId, task_id, changes));
});

server.registerTool("delete_task", {
  description: "Delete a task by ID.",
  inputSchema: { task_id: z.string() },
  annotations: destructive,
}, async ({ task_id }) => {
  const task = findTask(task_id);
  return result(await deleteTask(task?.projectId ?? "", task_id));
});

server.registerTool("add_project", {
  description: "Add a new project.",
  inputSchema: {
    name: z.string(), path: z.string(), tech_stack: z.array(z.string()).default([]), status: projectStatusSchema.default("in progress"),
    readme_preview: z.string().default(""), url: z.string().default(""), github_url: z.string().default(""),
  },
}, async ({ name, path, tech_stack, status, readme_preview, url, github_url }) => {
  const today = new Date().toISOString().slice(0, 10);
  const project: Project = {
    id: Date.now().toString(), name, path, techStack: tech_stack, dateCreated: today, lastUpdated: today,
    readmePreview: readme_preview, url, githubUrl: github_url, status,
  };
  await addProject(project);
  return result(project);
});

server.registerTool("update_project", {
  description: "Update an existing project by ID.",
  inputSchema: {
    project_id: z.string(), name: z.string().optional(), path: z.string().optional(), tech_stack: z.array(z.string()).optional(),
    status: projectStatusSchema.optional(), readme_preview: z.string().optional(), url: z.string().optional(), github_url: z.string().optional(),
  },
}, async ({ project_id, name, path, tech_stack, status, readme_preview, url, github_url }) => {
  const changes: Partial<Project> = {};
  if (name !== undefined) changes.name = name;
  if (path !== undefined) changes.path = path;
  if (tech_stack !== undefined) changes.techStack = tech_stack;
  if (status !== undefined) changes.status = status;
  if (readme_preview !== undefined) changes.readmePreview = readme_preview;
  if (url !== undefined) changes.url = url;
  if (github_url !== undefined) changes.githubUrl = github_url;
  const projects = await updateProject(project_id, changes);
  return result(projects.find((project) => project.id === project_id) ?? null);
});

server.registerTool("delete_project", {
  description: "Delete a project by ID.",
  inputSchema: { project_id: z.string() },
  annotations: destructive,
}, async ({ project_id }) => {
  const existed = getProjects().some((project) => project.id === project_id);
  if (existed) await deleteProject(project_id);
  return result(existed);
});

server.registerResource("projects", "project-hub://projects", { description: "Read-only snapshot of all tracked projects." }, async (uri) => ({ contents: [{ uri: uri.href, text: JSON.stringify(getProjects()) }] }));
server.registerResource("tasks", "project-hub://tasks", { description: "Read-only snapshot of all tasks." }, async (uri) => ({ contents: [{ uri: uri.href, text: JSON.stringify(getAllTasks()) }] }));
server.registerResource("project-tasks", new ResourceTemplate("project-hub://projects/{project_id}/tasks", { list: undefined }), { description: "Read-only tasks for one project." }, async (uri, variables) => ({ contents: [{ uri: uri.href, text: JSON.stringify(getProjectTasks(String(variables.project_id))) }] }));
server.registerResource("dependency-report", "project-hub://dependency-report/latest", { description: "Latest dependency tracker report." }, async (uri) => ({ contents: [{ uri: uri.href, text: JSON.stringify(await dependencyReport()) }] }));
server.registerResource("project-dependency-updates", new ResourceTemplate("project-hub://projects/{project_id_or_path}/dependency-updates", { list: undefined }), { description: "Dependency details for one project." }, async (uri, variables) => ({ contents: [{ uri: uri.href, text: JSON.stringify(await projectDependencyUpdates(String(variables.project_id_or_path))) }] }));

async function projectDependencyUpdates(idOrPath: string) {
  const project = findProject(idOrPath);
  const report = await dependencyReport();
  const dependencyProject = report.projects.find((item) => matchesDependencyProject(item, project, idOrPath));
  return {
    status: report.status === "missing" ? "missing" : dependencyProject ? "ready" : "not_found",
    project: project ?? null, dependency_project: dependencyProject ?? null,
    updates: dependencyProject?.updates ?? [], report_file_name: report.reportFileName,
  };
}

server.registerPrompt("review_dependency_update_prompt", {
  description: "Guide an agent through a dependency update review.",
  argsSchema: { package_name: z.string(), project_id_or_path: z.string().optional() },
}, async ({ package_name, project_id_or_path }) => ({ messages: [{
  role: "user",
  content: { type: "text", text: `Review dependency update \`${package_name}\` in Project Hub. ${project_id_or_path ? `Focus on project \`${project_id_or_path}\` and call get_project_dependency_updates first.` : "Call search_dependency_updates to find matching project updates."} Summarize current, wanted, and latest versions; dependency type; release dates; AI risk and priority; breaking changes; notable changes; evidence URLs; warnings or errors; and the safest next action.`, },
}] }));

await server.connect(new StdioServerTransport());
