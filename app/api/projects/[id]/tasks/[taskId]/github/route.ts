import { type NextRequest, NextResponse } from "next/server";
import { linkGithubIssueWorkflow, TaskWorkflowError } from "../../../../../../lib/taskWorkflow";

interface RouteContext {
  params: Promise<{ id: string; taskId: string }>;
}

export async function POST(_request: NextRequest, { params }: RouteContext) {
  const { id, taskId } = await params;
  try {
    const outcome = await linkGithubIssueWorkflow(id, taskId);
    if (outcome.status === "failed") return NextResponse.json(outcome, { status: 502 });
    if (outcome.status === "uncertain" || outcome.status === "partial")
      return NextResponse.json(outcome, { status: 202 });
    if (outcome.status === "conflict") return NextResponse.json(outcome, { status: 409 });
    return NextResponse.json(outcome.task);
  } catch (error) {
    if (!(error instanceof TaskWorkflowError)) throw error;
    if (error.code === "project_not_found" || error.code === "task_not_found")
      return NextResponse.json({ error: error.message }, { status: 404 });
    if (error.code === "github_not_configured")
      return NextResponse.json({ error: error.message }, { status: 503 });
    if (error.code === "github_repository_not_configured")
      return NextResponse.json({ error: error.message }, { status: 400 });
    if (error.code === "github_link_conflict")
      return NextResponse.json({ error: error.message }, { status: 409 });
    throw error;
  }
}
