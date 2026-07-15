import type { DependencyUpdatesReport } from "./dependencyReport";
import type { DependencyReportRunResult } from "./dependencyReportRunner";

const DEPENDENCY_UPDATES_BASE = "/api/dependency-updates";

async function handleResponse<T>(response: Response): Promise<T> {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error((data as { error?: string }).error ?? "Dependency update request failed");
  }
  return data as T;
}

export async function fetchDependencyUpdates(): Promise<DependencyUpdatesReport> {
  const response = await fetch(DEPENDENCY_UPDATES_BASE);
  return handleResponse<DependencyUpdatesReport>(response);
}

export async function runDependencyReport(projectPath?: string): Promise<{
  result: DependencyReportRunResult;
  report: DependencyUpdatesReport;
}> {
  const response = await fetch(`${DEPENDENCY_UPDATES_BASE}/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(projectPath ? { projectPath } : {}),
  });
  return handleResponse<{ result: DependencyReportRunResult; report: DependencyUpdatesReport }>(
    response
  );
}
