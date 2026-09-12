import { type NextRequest, NextResponse } from "next/server";
import {
  deleteTaskWorkflow,
  TaskWorkflowError,
  updateTaskWorkflow,
} from "../../../../../lib/taskWorkflow";

interface RouteContext {
  params: Promise<{ id: string; taskId: string }>;
}

function responseForWorkflowError(error: unknown) {
  if (!(error instanceof TaskWorkflowError)) return null;
  if (error.code === "project_not_found")
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  if (error.code === "task_not_found")
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  if (error.code === "invalid_task")
    return NextResponse.json({ error: "Invalid task changes" }, { status: 400 });
  if (error.code === "persistence_failed")
    return NextResponse.json({ error: "Unable to persist task" }, { status: 500 });
  if (error.code === "github_link_conflict")
    return NextResponse.json({ error: error.message }, { status: 409 });
  return null;
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const { id, taskId } = await params;
  const input = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  try {
    const { task } = await updateTaskWorkflow({ projectId: id, taskId, changes: input });
    return NextResponse.json(task);
  } catch (error) {
    const response = responseForWorkflowError(error);
    if (response) return response;
    throw error;
  }
}

export async function DELETE(_request: NextRequest, { params }: RouteContext) {
  const { id, taskId } = await params;
  try {
    await deleteTaskWorkflow(id, taskId);
    return NextResponse.json({ deleted: true });
  } catch (error) {
    const response = responseForWorkflowError(error);
    if (response) return response;
    throw error;
  }
}
