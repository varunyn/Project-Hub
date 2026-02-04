import type { Project } from "../types";

const BASE = "/api/projects";

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error((data as { error?: string }).error ?? "Request failed");
  }
  return response.json() as Promise<T>;
}

export async function fetchProjects(): Promise<Project[]> {
  const response = await fetch(BASE);
  return handleResponse<Project[]>(response);
}

export async function fetchProject(id: string): Promise<Project> {
  const response = await fetch(`${BASE}/${id}`);
  return handleResponse<Project>(response);
}

export async function createProject(data: Partial<Project>): Promise<Project[]> {
  const response = await fetch(BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return handleResponse<Project[]>(response);
}

export async function updateProject(id: string, data: Partial<Project>): Promise<Project[]> {
  const response = await fetch(`${BASE}/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return handleResponse<Project[]>(response);
}

export async function deleteProject(id: string): Promise<Project[]> {
  const response = await fetch(`${BASE}/${id}`, { method: "DELETE" });
  return handleResponse<Project[]>(response);
}
