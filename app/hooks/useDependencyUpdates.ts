"use client";

import { useCallback, useEffect } from "react";
import useSWR from "swr";
import type { DependencyUpdatesReport } from "../lib/dependencyReport";
import {
  type DependencyReportJobStatus,
  fetchDependencyReportAiPreferences,
  fetchDependencyReportStatus,
  fetchDependencyUpdates,
  runDependencyReport,
  saveDependencyReportAiPreference,
} from "../lib/dependencyUpdatesApi";

const DEPENDENCY_UPDATES_KEY = "/api/dependency-updates";
const DEPENDENCY_REPORT_STATUS_KEY = "/api/dependency-updates/status";
const DEPENDENCY_REPORT_PREFERENCES_KEY = "/api/dependency-updates/preferences";
const ACTIVE_JOB_STATES = new Set<DependencyReportJobStatus["status"]>(["running"]);
const STAGED_REPORT_PHASES = new Set<NonNullable<DependencyReportJobStatus["phase"]>>([
  "release_lookup",
  "ai_enrichment",
  "finalizing",
]);

export function useDependencyUpdates(projectPath?: string) {
  const dependencyUpdatesKey = projectPath
    ? `${DEPENDENCY_UPDATES_KEY}?projectPath=${encodeURIComponent(projectPath)}`
    : DEPENDENCY_UPDATES_KEY;
  const { data, error, isLoading, mutate } = useSWR<DependencyUpdatesReport>(
    dependencyUpdatesKey,
    fetchDependencyUpdates
  );
  const {
    data: jobStatus,
    error: statusError,
    isLoading: statusLoading,
    mutate: mutateStatus,
  } = useSWR<DependencyReportJobStatus>(DEPENDENCY_REPORT_STATUS_KEY, fetchDependencyReportStatus, {
    refreshInterval: (status) => (status && ACTIVE_JOB_STATES.has(status.status) ? 2000 : 0),
    revalidateOnFocus: true,
  });
  const { data: aiPreferences, mutate: mutateAiPreferences } = useSWR(
    DEPENDENCY_REPORT_PREFERENCES_KEY,
    fetchDependencyReportAiPreferences
  );

  const running = Boolean(jobStatus && ACTIVE_JOB_STATES.has(jobStatus.status));

  useEffect(() => {
    if (
      jobStatus?.status === "succeeded" ||
      (jobStatus?.status === "running" &&
        jobStatus.phase !== null &&
        STAGED_REPORT_PHASES.has(jobStatus.phase))
    ) {
      mutate().catch(() => undefined);
    }
  }, [jobStatus?.phase, jobStatus?.status, mutate]);

  const runReport = useCallback(
    async (projectPath?: string, aiEnabled?: boolean) => {
      const status = await runDependencyReport(projectPath, aiEnabled);
      await mutateStatus(status, false);
      return status;
    },
    [mutateStatus]
  );

  const setAiEnabled = useCallback(
    async (aiEnabled: boolean) => {
      const preferences = await saveDependencyReportAiPreference(aiEnabled);
      await mutateAiPreferences(preferences, false);
      return preferences;
    },
    [mutateAiPreferences]
  );

  return {
    report: data ?? null,
    loading: isLoading,
    error: error instanceof Error ? error.message : null,
    status: jobStatus ?? null,
    statusLoading,
    statusError: statusError instanceof Error ? statusError.message : null,
    running,
    refetch: () => mutate(),
    refetchStatus: () => mutateStatus(),
    runReport,
    aiPreferences: aiPreferences ?? null,
    setAiEnabled,
  };
}
