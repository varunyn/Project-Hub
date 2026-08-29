import type { ProjectTask, TaskPriority } from "../types";

export interface TaskFilterOptions {
  query?: string;
  priority?: "all" | TaskPriority;
  projectId?: "all" | string;
}

export function filterTasks(tasks: ProjectTask[], options: TaskFilterOptions): ProjectTask[] {
  const normalizedQuery = (options.query ?? "").trim().toLowerCase();
  const priority = options.priority ?? "all";
  const projectId = options.projectId ?? "all";

  return tasks.filter((task) => {
    const searchable = `${task.title} ${task.description} ${task.labels.join(" ")}`.toLowerCase();
    return (
      (!normalizedQuery || searchable.includes(normalizedQuery)) &&
      (priority === "all" || task.priority === priority) &&
      (projectId === "all" || task.projectId === projectId)
    );
  });
}
