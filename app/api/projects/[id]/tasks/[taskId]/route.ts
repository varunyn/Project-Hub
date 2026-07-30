import { type NextRequest, NextResponse } from "next/server";
import type { TaskPriority, TaskStatus } from "../../../../../types";
import {
  ensureGithubLabel,
  getGithubIssue,
  updateGithubIssueState,
} from "../../../../../utils/githubApi";
import {
  githubIssueStateForTask,
  githubStatusLabelForTask,
  parseGithubRepository,
} from "../../../../../utils/githubSync";
import { getProjects } from "../../../../../utils/projectUtils";
import {
  deleteTask,
  getProjectTasks,
  TASK_PRIORITIES,
  TASK_STATUSES,
  updateTask,
} from "../../../../../utils/taskUtils";

interface RouteContext {
  params: Promise<{ id: string; taskId: string }>;
}

function validChanges(input: Record<string, unknown>) {
  const validators: Record<string, (value: unknown) => unknown | null> = {
    title: (value) =>
      typeof value === "string" && value.trim() && value.length <= 200 ? value.trim() : null,
    description: (value) => (typeof value === "string" && value.length <= 5000 ? value : null),
    assigneeId: (value) => (typeof value === "string" && value.length <= 100 ? value : null),
    dueDate: (value) =>
      typeof value === "string" && (value === "" || /^\d{4}-\d{2}-\d{2}$/.test(value))
        ? value
        : null,
    labels: (value) =>
      Array.isArray(value) &&
      value.length <= 10 &&
      value.every((label) => typeof label === "string" && label.length <= 40)
        ? value
        : null,
    status: (value) => (TASK_STATUSES.includes(value as TaskStatus) ? value : null),
    priority: (value) => (TASK_PRIORITIES.includes(value as TaskPriority) ? value : null),
    position: (value) => (Number.isInteger(value) && Number(value) >= 0 ? value : null),
    githubIssueNumber: (value) => (Number.isInteger(value) && Number(value) > 0 ? value : null),
    githubIssueUrl: (value) => (typeof value === "string" && value.length <= 500 ? value : null),
  };
  const changes: Record<string, unknown> = {};
  for (const [key, validator] of Object.entries(validators)) {
    if (key in input) {
      const value = validator(input[key]);
      if (value === null) return null;
      changes[key] = value;
    }
  }
  return changes;
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const { id, taskId } = await params;
  if (!getProjects().some((project) => project.id === id))
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  const changes = validChanges((await request.json().catch(() => ({}))) as Record<string, unknown>);
  if (!changes || Object.keys(changes).length === 0)
    return NextResponse.json({ error: "Invalid task changes" }, { status: 400 });
  const existingTask = getProjectTasks(id).find((task) => task.id === taskId);
  if (!existingTask) return NextResponse.json({ error: "Task not found" }, { status: 404 });
  const nextStatus = changes.status as TaskStatus | undefined;
  if (
    nextStatus &&
    nextStatus !== existingTask.status &&
    existingTask.githubIssueNumber &&
    projectGithubSyncAvailable(id)
  ) {
    try {
      const project = getProjects().find((item) => item.id === id);
      const repository = parseGithubRepository(project?.githubUrl ?? "");
      const statusLabel = githubStatusLabelForTask(nextStatus);
      const githubIssue = await getGithubIssue(
        repository.owner,
        repository.repo,
        existingTask.githubIssueNumber,
        process.env.GITHUB_TOKEN as string
      );
      await ensureGithubLabel(
        repository.owner,
        repository.repo,
        process.env.GITHUB_TOKEN as string,
        statusLabel,
        "1d76db"
      );
      await updateGithubIssueState(
        repository.owner,
        repository.repo,
        existingTask.githubIssueNumber,
        process.env.GITHUB_TOKEN as string,
        githubIssueStateForTask(nextStatus),
        [
          ...githubIssue.labels
            .map((label) => label.name)
            .filter((label) => !label.startsWith("status:")),
          statusLabel,
        ]
      );
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "GitHub issue update failed" },
        { status: 502 }
      );
    }
  }
  const updated = await updateTask(id, taskId, changes);
  if (!updated) return NextResponse.json({ error: "Task not found" }, { status: 404 });
  return NextResponse.json(updated);
}

function projectGithubSyncAvailable(projectId: string): boolean {
  const project = getProjects().find((item) => item.id === projectId);
  return Boolean(process.env.GITHUB_TOKEN && project?.githubUrl);
}

export async function DELETE(_request: NextRequest, { params }: RouteContext) {
  const { id, taskId } = await params;
  if (!getProjects().some((project) => project.id === id))
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  if (!(await deleteTask(id, taskId)))
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  return NextResponse.json({ deleted: true });
}
