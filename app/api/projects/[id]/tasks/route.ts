import { randomUUID } from "node:crypto";
import { type NextRequest, NextResponse } from "next/server";
import type { ProjectTask, TaskPriority, TaskStatus } from "../../../../types";
import { getProjects } from "../../../../utils/projectUtils";
import {
  createTask,
  getProjectTasks,
  TASK_PRIORITIES,
  TASK_STATUSES,
} from "../../../../utils/taskUtils";

interface RouteContext {
  params: Promise<{ id: string }>;
}

function validTaskInput(input: Record<string, unknown>) {
  const title = typeof input.title === "string" ? input.title.trim() : "";
  const status = input.status ?? "todo";
  const priority = input.priority ?? "medium";
  if (!title || title.length > 200) return null;
  if (!TASK_STATUSES.includes(status as TaskStatus)) return null;
  if (!TASK_PRIORITIES.includes(priority as TaskPriority)) return null;
  return { title, status: status as TaskStatus, priority: priority as TaskPriority };
}

export async function GET(_request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  if (!getProjects().some((project) => project.id === id)) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }
  return NextResponse.json(getProjectTasks(id));
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  if (!getProjects().some((project) => project.id === id)) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }
  const input = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const valid = validTaskInput(input);
  if (!valid) return NextResponse.json({ error: "Invalid task" }, { status: 400 });
  const now = new Date().toISOString();
  const task: ProjectTask = {
    id: randomUUID(),
    projectId: id,
    title: valid.title,
    description: "",
    status: valid.status,
    priority: valid.priority,
    assigneeId: "",
    labels: [],
    dueDate: "",
    position: getProjectTasks(id).filter((item) => item.status === valid.status).length,
    createdAt: now,
    updatedAt: now,
  };
  return NextResponse.json(await createTask(task), { status: 201 });
}
