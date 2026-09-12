"use client";

import { useCallback } from "react";
import useSWR from "swr";
import type {
  GithubIssueLinkResult,
  GithubLinkResolutionResult,
  TaskApiError,
} from "../lib/tasksApi";
import {
  createGithubIssueForTask,
  createProjectTask,
  deleteProjectTask,
  fetchProjectTasks,
  importGithubIssues,
  resolveGithubLink,
  retryGithubStatus,
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
      const updated = await updateProjectTask(task.projectId, task.id, changes);
      mutate(
        (current) => (current ?? []).map((item) => (item.id === updated.id ? updated : item)),
        false
      );
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
      const updated = await updateProjectTask(task.projectId, task.id, { status });
      mutate(
        (current) => (current ?? []).map((item) => (item.id === updated.id ? updated : item)),
        false
      );
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
    async (taskId: string): Promise<GithubIssueLinkResult> => {
      if (!projectId) throw new Error("No project selected");
      try {
        const result = await createGithubIssueForTask(projectId, taskId);
        const task = "task" in result ? result.task : result;
        mutate(
          (current) => (current ?? []).map((item) => (item.id === task.id ? task : item)),
          false
        );
        return result;
      } catch (error) {
        if (
          error instanceof Error &&
          "status" in error &&
          ((error as TaskApiError).status === 409 || (error as TaskApiError).status === 502)
        ) {
          await mutate();
        }
        throw error;
      }
    },
    [projectId, mutate]
  );

  const retryGithubTaskStatus = useCallback(
    async (taskId: string) => {
      if (!projectId) throw new Error("No project selected");
      const result = await retryGithubStatus(projectId, taskId);
      mutate(
        (current) =>
          (current ?? []).map((task) => (task.id === result.task.id ? result.task : task)),
        false
      );
      return result;
    },
    [projectId, mutate]
  );

  const resolveGithubTaskLink = useCallback(
    async (
      taskId: string,
      resolution:
        | { action: "attach"; issueNumber: number; issueUrl: string }
        | { action: "confirm-none" }
    ): Promise<GithubLinkResolutionResult> => {
      if (!projectId) throw new Error("No project selected");
      const result = await resolveGithubLink(projectId, taskId, resolution);
      mutate(
        (current) =>
          (current ?? []).map((task) => (task.id === result.task.id ? result.task : task)),
        false
      );
      return result;
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
    retryGithubTaskStatus,
    resolveGithubTaskLink,
  };
}
