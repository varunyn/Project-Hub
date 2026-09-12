import { type NextRequest, NextResponse } from "next/server";
import {
  retryGithubStatusWorkflow,
  TaskWorkflowError,
} from "../../../../../../../../lib/taskWorkflow";

interface RouteContext {
  params: Promise<{ id: string; taskId: string }>;
}

function responseForWorkflowError(error: unknown) {
  if (!(error instanceof TaskWorkflowError)) return null;
  if (error.code === "project_not_found" || error.code === "task_not_found")
    return NextResponse.json(
      { error: error.code === "project_not_found" ? "Project not found" : "Task not found" },
      { status: 404 }
    );
  if (error.code === "task_not_linked")
    return NextResponse.json({ error: "Task is not linked to a GitHub issue" }, { status: 409 });
  if (error.code === "persistence_failed")
    return NextResponse.json({ error: "Unable to persist task" }, { status: 500 });
  return null;
}

export async function POST(_request: NextRequest, { params }: RouteContext) {
  const { id, taskId } = await params;
  try {
    const { task, githubSynchronization } = await retryGithubStatusWorkflow({
      projectId: id,
      taskId,
    });
    return NextResponse.json({ task, githubSynchronization });
  } catch (error) {
    const response = responseForWorkflowError(error);
    if (response) return response;
    throw error;
  }
}
