"use client";

import { useCallback, useState } from "react";
import useSWR from "swr";
import {
  createProject as apiCreateProject,
  deleteProject as apiDeleteProject,
  fetchProjects as apiFetchProjects,
  updateProject as apiUpdateProject,
} from "../lib/projectsApi";
import type { Project } from "../types";

const PROJECTS_KEY = "/api/projects";

export function useProjects() {
  const [mutationError, setMutationError] = useState<string | null>(null);
  const {
    data: projects = [],
    error,
    isLoading,
    mutate,
  } = useSWR<Project[]>(PROJECTS_KEY, apiFetchProjects);

  const addProject = useCallback(
    async (data: Partial<Project>) => {
      setMutationError(null);
      try {
        const updated = await apiCreateProject(data);
        mutate(updated, false);
        return updated;
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed to add project. Please try again.";
        setMutationError(msg);
        throw err;
      }
    },
    [mutate],
  );

  const updateProject = useCallback(
    async (id: string, data: Partial<Project>) => {
      setMutationError(null);
      try {
        const updated = await apiUpdateProject(id, data);
        mutate(updated, false);
        return updated;
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : "Failed to update project. Please try again.";
        setMutationError(msg);
        throw err;
      }
    },
    [mutate],
  );

  const removeProject = useCallback(
    async (id: string) => {
      setMutationError(null);
      try {
        const updated = await apiDeleteProject(id);
        mutate(updated, false);
        return updated;
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : "Failed to delete project. Please try again.";
        setMutationError(msg);
        throw err;
      }
    },
    [mutate],
  );

  const clearError = useCallback(() => {
    setMutationError(null);
    mutate(undefined, true);
  }, [mutate]);

  return {
    projects,
    loading: isLoading,
    error: mutationError ?? error?.message ?? null,
    refetch: () => mutate(),
    addProject,
    updateProject,
    deleteProject: removeProject,
    clearError,
  };
}
