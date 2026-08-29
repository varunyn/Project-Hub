"use client";

import { useCallback } from "react";
import useSWR from "swr";
import { deleteProjectTask, fetchAllTasks, updateProjectTask } from "../lib/tasksApi";
import type { ProjectTask, TaskStatus } from "../types";

const ALL_TASKS_KEY = "/api/tasks";

export function useAllTasks() {
  const {
    data: tasks = [],
    error,
    isLoading,
    mutate,
  } = useSWR<ProjectTask[]>(ALL_TASKS_KEY, fetchAllTasks);

  const refresh = useCallback(() => mutate(), [mutate]);

  const updateTask = useCallback(
    async (task: ProjectTask, changes: Partial<ProjectTask>) => {
      await updateProjectTask(task.projectId, task.id, changes);
      mutate();
    },
    [mutate]
  );

  const deleteTask = useCallback(
    async (task: ProjectTask) => {
      await deleteProjectTask(task.projectId, task.id);
      mutate();
    },
    [mutate]
  );

  const moveTask = useCallback(
    async (task: ProjectTask, status: TaskStatus) => {
      await updateProjectTask(task.projectId, task.id, { status });
      mutate();
    },
    [mutate]
  );

  return {
    tasks,
    loading: isLoading,
    error: error?.message ?? null,
    refresh,
    updateTask,
    deleteTask,
    moveTask,
  };
}
