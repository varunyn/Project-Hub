"use client";

import { useCallback, useEffect } from "react";
import useSWR from "swr";
import type { DependencyUpdatesReport } from "../lib/dependencyReport";
import {
  type DependencyReportJobStatus,
  fetchDependencyReportStatus,
  fetchDependencyUpdates,
  runDependencyReport,
} from "../lib/dependencyUpdatesApi";

const DEPENDENCY_UPDATES_KEY = "/api/dependency-updates";
const DEPENDENCY_REPORT_STATUS_KEY = "/api/dependency-updates/status";
const ACTIVE_JOB_STATES = new Set<DependencyReportJobStatus["status"]>(["running"]);

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

  const running = Boolean(jobStatus && ACTIVE_JOB_STATES.has(jobStatus.status));

  useEffect(() => {
    if (jobStatus?.status === "succeeded") {
      mutate().catch(() => undefined);
    }
  }, [jobStatus?.status, mutate]);

  const runReport = useCallback(
    async (projectPath?: string) => {
      const status = await runDependencyReport(projectPath);
      await mutateStatus(status, false);
      return status;
    },
    [mutateStatus]
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
  };
}
