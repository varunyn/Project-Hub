"use client";

import { useCallback } from "react";
import useSWR from "swr";
import {
  createGithubIssueForTask,
  createProjectTask,
  deleteProjectTask,
  fetchProjectTasks,
  importGithubIssues,
  updateProjectTask,
} from "../lib/tasksApi";
import type { ProjectTask, TaskStatus } from "../types";

export function useProjectTasks(projectId: string | null) {
  const key = projectId ? `project-tasks:${projectId}` : null;
  const {
    data: tasks = [],
    error,
    isLoading,
    mutate,
  } = useSWR<ProjectTask[]>(key, () =>
    projectId ? fetchProjectTasks(projectId) : Promise.resolve([])
  );

  const refresh = useCallback(() => mutate(), [mutate]);

  const createTask = useCallback(
    async (title: string) => {
      if (!projectId) throw new Error("No project selected");
      const created = await createProjectTask(projectId, { title });
      mutate((current) => [...(current ?? []), created], false);
      return created;
    },
    [projectId, mutate]
  );

  const updateTask = useCallback(
    async (task: ProjectTask, changes: Partial<ProjectTask>) => {
      if (!projectId) throw new Error("No project selected");
      await updateProjectTask(task.projectId, task.id, changes);
      mutate();
    },
    [projectId, mutate]
  );

  const deleteTask = useCallback(
    async (task: ProjectTask) => {
      if (!projectId) throw new Error("No project selected");
      await deleteProjectTask(task.projectId, task.id);
      mutate();
    },
    [projectId, mutate]
  );

  const moveTask = useCallback(
    async (task: ProjectTask, status: TaskStatus) => {
      if (!projectId) throw new Error("No project selected");
      await updateProjectTask(task.projectId, task.id, { status });
      mutate();
    },
    [projectId, mutate]
  );

  const syncGithub = useCallback(async () => {
    if (!projectId) throw new Error("No project selected");
    const result = await importGithubIssues(projectId);
    mutate();
    return result;
  }, [projectId, mutate]);

  const createGithubIssue = useCallback(
    async (taskId: string) => {
      if (!projectId) throw new Error("No project selected");
      const updated = await createGithubIssueForTask(projectId, taskId);
      mutate((current) => (current ?? []).map((task) => (task.id === updated.id ? updated : task)));
      return updated;
    },
    [projectId, mutate]
  );

  return {
    tasks,
    loading: isLoading,
    error: error?.message ?? null,
    refresh,
    createTask,
    updateTask,
    deleteTask,
    moveTask,
    syncGithub,
    createGithubIssue,
  };
}
