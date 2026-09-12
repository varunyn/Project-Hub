import { type NextRequest, NextResponse } from "next/server";
import { createTask, TaskWorkflowError } from "../../../../lib/taskWorkflow";
import type { TaskPriority, TaskStatus } from "../../../../types";
import { getProjects } from "../../../../utils/projectUtils";
import { getProjectTasks } from "../../../../utils/taskUtils";

interface RouteContext {
  params: Promise<{ id: string }>;
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
  try {
    const task = await createTask({
      projectId: id,
      title: input.title as string,
      status: input.status as TaskStatus | undefined,
      priority: input.priority as TaskPriority | undefined,
    });
    return NextResponse.json(task, { status: 201 });
  } catch (error) {
    if (error instanceof TaskWorkflowError && error.code === "invalid_task") {
      return NextResponse.json({ error: "Invalid task" }, { status: 400 });
    }
    if (error instanceof TaskWorkflowError && error.code === "project_not_found") {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }
    throw error;
  }
}
