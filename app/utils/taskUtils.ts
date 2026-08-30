import fs from "node:fs";
import path from "node:path";
import type { ProjectTask, TaskPriority, TaskStatus } from "../types";
import { withFileLock } from "./fileLock";

const dataDir = process.env.PROJECT_DATA_DIR || path.join(process.cwd(), "app", "data");
const tasksFilePath = path.join(dataDir, "tasks.json");

export const TASK_STATUSES: TaskStatus[] = ["backlog", "todo", "in-progress", "review", "done"];
export const TASK_PRIORITIES: TaskPriority[] = ["low", "medium", "high"];

function ensureTasksFile() {
  fs.mkdirSync(dataDir, { recursive: true });
  if (!fs.existsSync(tasksFilePath)) fs.writeFileSync(tasksFilePath, "[]", "utf8");
}

export function getTasks(): ProjectTask[] {
  ensureTasksFile();
  try {
    return JSON.parse(fs.readFileSync(tasksFilePath, "utf8")) as ProjectTask[];
  } catch (error) {
    console.error("Error reading tasks:", error);
    return [];
  }
}

function saveTasks(tasks: ProjectTask[]) {
  const temporaryPath = `${tasksFilePath}.${process.pid}.tmp`;
  fs.writeFileSync(temporaryPath, JSON.stringify(tasks, null, 2), "utf8");
  fs.renameSync(temporaryPath, tasksFilePath);
}

let tasksWriteQueue: Promise<void> = Promise.resolve();

function queueTaskWrite<T>(operation: () => T): Promise<T> {
  const queuedOperation = tasksWriteQueue.then(operation);
  tasksWriteQueue = queuedOperation.then(
    () => undefined,
    () => undefined
  );
  return queuedOperation;
}

export function getProjectTasks(projectId: string): ProjectTask[] {
  return getTasks()
    .filter((task) => task.projectId === projectId)
    .sort(
      (a, b) =>
        TASK_STATUSES.indexOf(a.status) - TASK_STATUSES.indexOf(b.status) || a.position - b.position
    );
}

export function getAllTasks(): ProjectTask[] {
  return getTasks().sort(
    (a, b) =>
      TASK_STATUSES.indexOf(a.status) - TASK_STATUSES.indexOf(b.status) ||
      a.position - b.position ||
      a.updatedAt.localeCompare(b.updatedAt)
  );
}

export async function createTask(task: ProjectTask): Promise<ProjectTask> {
  return queueTaskWrite(() =>
    withFileLock(tasksFilePath, () => {
      const tasks = getTasks();
      saveTasks([...tasks, task]);
      return task;
    })
  );
}

export async function updateTask(
  projectId: string,
  taskId: string,
  changes: Partial<Omit<ProjectTask, "id" | "projectId" | "createdAt">>
): Promise<ProjectTask | null> {
  return queueTaskWrite(() =>
    withFileLock(tasksFilePath, () => {
      const tasks = getTasks();
      const existing = tasks.find((task) => task.id === taskId && task.projectId === projectId);
      if (!existing) return null;
      const updated = { ...existing, ...changes, updatedAt: new Date().toISOString() };
      const projectTasks = tasks.filter(
        (task) => task.projectId === projectId && task.id !== taskId
      );
      const destinationTasks = projectTasks
        .filter((task) => task.status === updated.status)
        .sort((a, b) => a.position - b.position);
      const requestedPosition =
        changes.position ??
        (existing.status === updated.status ? existing.position : destinationTasks.length);
      const destinationPosition = Math.max(0, Math.min(requestedPosition, destinationTasks.length));
      destinationTasks.splice(destinationPosition, 0, updated);

      const reorderedProjectTasks = TASK_STATUSES.flatMap((status) => {
        const statusTasks =
          status === updated.status
            ? destinationTasks
            : projectTasks
                .filter((task) => task.status === status)
                .sort((a, b) => a.position - b.position);
        return statusTasks.map((task, position) => ({ ...task, position }));
      });
      saveTasks([
        ...tasks.filter((task) => task.projectId !== projectId),
        ...reorderedProjectTasks,
      ]);
      return reorderedProjectTasks.find((task) => task.id === taskId) ?? null;
    })
  );
}

export async function deleteTask(projectId: string, taskId: string): Promise<boolean> {
  return queueTaskWrite(() =>
    withFileLock(tasksFilePath, () => {
      const tasks = getTasks();
      const remaining = tasks.filter(
        (task) => !(task.id === taskId && task.projectId === projectId)
      );
      if (remaining.length === tasks.length) return false;
      saveTasks(remaining);
      return true;
    })
  );
}

export function normalizeProjectTaskPositions(
  tasks: ProjectTask[],
  projectId: string
): ProjectTask[] {
  const projectTasks = tasks.filter((task) => task.projectId === projectId);
  return TASK_STATUSES.flatMap((status) =>
    projectTasks
      .filter((task) => task.status === status)
      .sort((a, b) => a.position - b.position)
      .map((task, position) => ({ ...task, position }))
  );
}
