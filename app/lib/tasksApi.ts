import type { ProjectTask } from "../types";

const responseData = async <T>(response: Response): Promise<T> => {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error((data as { error?: string }).error ?? "Task request failed");
  return data as T;
};

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
