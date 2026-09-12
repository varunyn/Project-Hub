import type { ProjectTask } from "../types";

export type GithubIssueLinkResult =
  | ProjectTask
  | {
      status: "partial" | "uncertain" | "failed" | "conflict";
      task: ProjectTask;
      issueNumber?: number;
      issueUrl?: string;
      error?: string;
    };

export type GithubLinkResolutionResult =
  | { task: ProjectTask; resolution: "cleared" }
  | { task: ProjectTask; githubSynchronization: { status: "synced" | "failed"; error?: string } };

export class TaskApiError extends Error {
  readonly status: number;
  readonly payload: unknown;
  constructor(status: number, payload: unknown, message: string) {
    super(message);
    this.name = "TaskApiError";
    this.status = status;
    this.payload = payload;
  }
}

const responseData = async <T>(response: Response): Promise<T> => {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const payload = data as { error?: string; issueUrl?: string; issueNumber?: number };
    const issue = payload.issueUrl
      ? ` Issue #${payload.issueNumber ?? ""} is available at ${payload.issueUrl}.`
      : "";
    throw new TaskApiError(
      response.status,
      data,
      `${payload.error ?? "Task request failed"}${issue}`
    );
  }
  return data as T;
};

export function fetchAllTasks(): Promise<ProjectTask[]> {
  return fetch("/api/tasks", { cache: "no-store" }).then((response) =>
    responseData<ProjectTask[]>(response)
  );
}

export function fetchProjectTasks(projectId: string): Promise<ProjectTask[]> {
  return fetch(`/api/projects/${projectId}/tasks`, { cache: "no-store" }).then((response) =>
    responseData<ProjectTask[]>(response)
  );
}

export function createProjectTask(projectId: string, task: Partial<ProjectTask>) {
  return fetch(`/api/projects/${projectId}/tasks`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(task),
  }).then(responseData<ProjectTask>);
}

export function updateProjectTask(
  projectId: string,
  taskId: string,
  changes: Partial<ProjectTask>
) {
  return fetch(`/api/projects/${projectId}/tasks/${taskId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(changes),
  }).then(responseData<ProjectTask>);
}

export function deleteProjectTask(projectId: string, taskId: string) {
  return fetch(`/api/projects/${projectId}/tasks/${taskId}`, { method: "DELETE" }).then(
    responseData<{ deleted: boolean }>
  );
}

export function importGithubIssues(projectId: string) {
  return fetch(`/api/projects/${projectId}/github/issues`, { method: "POST" }).then(
    responseData<{ imported: number; updated: number; total: number }>
  );
}

export function createGithubIssueForTask(
  projectId: string,
  taskId: string
): Promise<GithubIssueLinkResult> {
  return fetch(`/api/projects/${projectId}/tasks/${taskId}/github`, { method: "POST" }).then(
    responseData<GithubIssueLinkResult>
  );
}

export function retryGithubStatus(projectId: string, taskId: string) {
  return fetch(`/api/projects/${projectId}/tasks/${taskId}/github/status/retry`, {
    method: "POST",
  }).then(
    responseData<{
      task: ProjectTask;
      githubSynchronization:
        | { status: "synced"; completedAt: string }
        | { status: "failed"; attemptedAt: string; error: string };
    }>
  );
}

export function resolveGithubLink(
  projectId: string,
  taskId: string,
  resolution:
    | { action: "attach"; issueNumber: number; issueUrl: string }
    | { action: "confirm-none" }
): Promise<GithubLinkResolutionResult> {
  return fetch(`/api/projects/${projectId}/tasks/${taskId}/github/resolve`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(resolution),
  }).then(responseData<GithubLinkResolutionResult>);
}
