import type { DependencyUpdatesReport } from "./dependencyReport";

const DEPENDENCY_UPDATES_BASE = "/api/dependency-updates";

export type DependencyReportJobState = "idle" | "running" | "succeeded" | "failed" | "interrupted";

export interface DependencyReportJobStatus {
  id: string | null;
  status: DependencyReportJobState;
  scope: string | null;
  projectPath: string | null;
  startedAt: string | null;
  completedAt: string | null;
  error: string | null;
}

async function handleResponse<T>(response: Response): Promise<T> {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error((data as { error?: string }).error ?? "Dependency update request failed");
  }
  return data as T;
}

export async function fetchDependencyUpdates(
  requestUrl = DEPENDENCY_UPDATES_BASE
): Promise<DependencyUpdatesReport> {
  const response = await fetch(requestUrl);
  return handleResponse<DependencyUpdatesReport>(response);
}

export async function fetchDependencyReportStatus(): Promise<DependencyReportJobStatus> {
  const response = await fetch(`${DEPENDENCY_UPDATES_BASE}/status`);
  const data = await handleResponse<{ job?: DependencyReportJobStatus }>(response);
  return (
    data.job ?? {
      id: null,
      status: "idle",
      scope: null,
      projectPath: null,
      startedAt: null,
      completedAt: null,
      error: null,
    }
  );
}

export async function runDependencyReport(
  projectPath?: string
): Promise<DependencyReportJobStatus> {
  const response = await fetch(`${DEPENDENCY_UPDATES_BASE}/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(projectPath ? { projectPath } : {}),
  });
  const data = await handleResponse<{ job?: DependencyReportJobStatus }>(response);
  return (
    data.job ?? {
      id: null,
      status: "idle",
      scope: null,
      projectPath: null,
      startedAt: null,
      completedAt: null,
      error: null,
    }
  );
}
