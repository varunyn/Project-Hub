"use client";

import { useCallback, useState } from "react";
import useSWR from "swr";
import {
  createProject as apiCreateProject,
  deleteProject as apiDeleteProject,
  fetchProjects as apiFetchProjects,
  scanProjects as apiScanProjects,
  updateProject as apiUpdateProject,
} from "../lib/projectsApi";
import type { Project } from "../types";

const PROJECTS_KEY = "/api/projects";

export function useProjects() {
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [scanMessage, setScanMessage] = useState<string | null>(null);
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
    mutate(undefined, { revalidate: true });
  }, [mutate]);

  const scanProjects = useCallback(async () => {
    setMutationError(null);
    setScanMessage(null);
    setIsScanning(true);
    try {
      const updated = await apiScanProjects();
      mutate(updated, false);
      const addedCount = Math.max(0, updated.length - projects.length);
      if (addedCount > 0) {
        setScanMessage(
          `Scan complete: added ${addedCount} new project${addedCount === 1 ? "" : "s"}.`,
        );
      } else {
        setScanMessage("Scan complete: no new projects found.");
      }
      return updated;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to scan projects. Please try again.";
      setMutationError(msg);
      throw err;
    } finally {
      setIsScanning(false);
    }
  }, [mutate, projects.length]);

  return {
    projects,
    loading: isLoading,
    scanning: isScanning,
    scanMessage,
    error: mutationError ?? error?.message ?? null,
    refetch: () => mutate(),
    scanProjects,
    addProject,
    updateProject,
    deleteProject: removeProject,
    clearError,
  };
}
