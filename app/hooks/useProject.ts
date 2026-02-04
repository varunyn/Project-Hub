"use client";

import { useCallback } from "react";
import useSWR from "swr";
import {
  fetchProject as apiFetchProject,
  updateProject as apiUpdateProject,
} from "../lib/projectsApi";
import type { Project } from "../types";

export function useProject(id: string | null) {
  const {
    data: project,
    error,
    isLoading,
    mutate,
  } = useSWR<Project>(id, id ? apiFetchProject : null);

  const updateProject = useCallback(
    async (data: Partial<Project>) => {
      if (!id) return;
      await apiUpdateProject(id, data);
      mutate((prev) => (prev ? { ...prev, ...data } : null), false);
    },
    [id, mutate],
  );

  return {
    project: project ?? null,
    loading: isLoading,
    error: error?.message ?? null,
    refetch: () => mutate(),
    updateProject,
  };
}
