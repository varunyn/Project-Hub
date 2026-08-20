import type { TaskPriority, TaskStatus } from "../types";

export const TASK_STATUSES: TaskStatus[] = ["backlog", "todo", "in-progress", "review", "done"];
export const TASK_PRIORITIES: TaskPriority[] = ["low", "medium", "high"];

export const TASK_COLUMNS: Array<{ id: TaskStatus; label: string; tone: string }> = [
  { id: "backlog", label: "Backlog", tone: "bg-slate-400" },
  { id: "todo", label: "Todo", tone: "bg-sky-500" },
  { id: "in-progress", label: "In Progress", tone: "bg-amber-500" },
  { id: "review", label: "Review", tone: "bg-violet-500" },
  { id: "done", label: "Done", tone: "bg-emerald-500" },
];

export type ToastTone = "info" | "success" | "danger";

export interface ToastState {
  message: string;
  tone: ToastTone;
}
