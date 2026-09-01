import type { DependencyUpdatesReport } from "./dependencyReport";
import type { DependencyReportPhase } from "./dependencyReportUi";

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
  aiEnabled: boolean;
  aiAvailable: boolean;
  phase: DependencyReportPhase | null;
  completed: number;
  total: number;
}

export interface DependencyReportAiPreferences {
  aiAvailable: boolean;
  defaultAiEnabled: boolean;
  maxPackages: number;
  aiEnabled: boolean;
}

async function handleResponse<T>(response: Response): Promise<T> {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error((data as { error?: string }).error ?? "Dependency update request failed");
  }
  return data as T;
}

function normalizeJobStatus(
  job: Partial<DependencyReportJobStatus> | undefined
): DependencyReportJobStatus {
  return {
    id: job?.id ?? null,
    status: job?.status ?? "idle",
    scope: job?.scope ?? null,
    projectPath: job?.projectPath ?? null,
    startedAt: job?.startedAt ?? null,
    completedAt: job?.completedAt ?? null,
    error: job?.error ?? null,
    aiEnabled: job?.aiEnabled ?? false,
    aiAvailable: job?.aiAvailable ?? false,
    phase: job?.phase ?? null,
    completed: typeof job?.completed === "number" ? job.completed : 0,
    total: typeof job?.total === "number" ? job.total : 0,
  };
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
  return normalizeJobStatus(data.job);
}

export async function fetchDependencyReportAiPreferences(): Promise<DependencyReportAiPreferences> {
  return handleResponse<DependencyReportAiPreferences>(
    await fetch(`${DEPENDENCY_UPDATES_BASE}/preferences`)
  );
}

export async function saveDependencyReportAiPreference(
  aiEnabled: boolean
): Promise<DependencyReportAiPreferences> {
  return handleResponse<DependencyReportAiPreferences>(
    await fetch(`${DEPENDENCY_UPDATES_BASE}/preferences`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ aiEnabled }),
    })
  );
}

export async function runDependencyReport(
  projectPath?: string,
  includeAi?: boolean
): Promise<DependencyReportJobStatus> {
  const response = await fetch(`${DEPENDENCY_UPDATES_BASE}/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...(projectPath ? { projectPath } : {}),
      ...(includeAi === undefined ? {} : { aiEnabled: includeAi }),
    }),
  });
  const data = await handleResponse<{ job?: DependencyReportJobStatus }>(response);
  return normalizeJobStatus(data.job);
}
