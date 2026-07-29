import { type NextRequest, NextResponse } from "next/server";
import type { TaskPriority, TaskStatus } from "../../../../../types";
import { getProjects } from "../../../../../utils/projectUtils";
import {
  deleteTask,
  TASK_PRIORITIES,
  TASK_STATUSES,
  updateTask,
} from "../../../../../utils/taskUtils";

interface RouteContext {
  params: Promise<{ id: string; taskId: string }>;
}

function validChanges(input: Record<string, unknown>) {
  const validators: Record<string, (value: unknown) => unknown | null> = {
    title: (value) =>
      typeof value === "string" && value.trim() && value.length <= 200 ? value.trim() : null,
    description: (value) => (typeof value === "string" && value.length <= 5000 ? value : null),
    assigneeId: (value) => (typeof value === "string" && value.length <= 100 ? value : null),
    dueDate: (value) =>
      typeof value === "string" && (value === "" || /^\d{4}-\d{2}-\d{2}$/.test(value))
        ? value
        : null,
    labels: (value) =>
      Array.isArray(value) &&
      value.length <= 10 &&
      value.every((label) => typeof label === "string" && label.length <= 40)
        ? value
        : null,
    status: (value) => (TASK_STATUSES.includes(value as TaskStatus) ? value : null),
    priority: (value) => (TASK_PRIORITIES.includes(value as TaskPriority) ? value : null),
    position: (value) => (Number.isInteger(value) && Number(value) >= 0 ? value : null),
  };
  const changes: Record<string, unknown> = {};
  for (const [key, validator] of Object.entries(validators)) {
    if (key in input) {
      const value = validator(input[key]);
      if (value === null) return null;
      changes[key] = value;
    }
  }
  return changes;
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const { id, taskId } = await params;
  if (!getProjects().some((project) => project.id === id))
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  const changes = validChanges((await request.json().catch(() => ({}))) as Record<string, unknown>);
  if (!changes || Object.keys(changes).length === 0)
    return NextResponse.json({ error: "Invalid task changes" }, { status: 400 });
  const updated = await updateTask(id, taskId, changes);
  if (!updated) return NextResponse.json({ error: "Task not found" }, { status: 404 });
  return NextResponse.json(updated);
}

export async function DELETE(_request: NextRequest, { params }: RouteContext) {
  const { id, taskId } = await params;
  if (!getProjects().some((project) => project.id === id))
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  if (!(await deleteTask(id, taskId)))
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  return NextResponse.json({ deleted: true });
}
