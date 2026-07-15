"use client";

import useSWR from "swr";
import type { DependencyUpdatesReport } from "../lib/dependencyReport";
import { fetchDependencyUpdates, runDependencyReport } from "../lib/dependencyUpdatesApi";

const DEPENDENCY_UPDATES_KEY = "/api/dependency-updates";

export function useDependencyUpdates() {
  const { data, error, isLoading, mutate } = useSWR<DependencyUpdatesReport>(
    DEPENDENCY_UPDATES_KEY,
    fetchDependencyUpdates
  );

  return {
    report: data ?? null,
    loading: isLoading,
    error: error instanceof Error ? error.message : null,
    refetch: () => mutate(),
    runReport: async (projectPath?: string) => {
      const response = await runDependencyReport(projectPath);
      await mutate(response.report, false);
      return response;
    },
  };
}
