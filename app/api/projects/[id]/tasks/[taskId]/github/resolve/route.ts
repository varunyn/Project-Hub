import { type NextRequest, NextResponse } from "next/server";
import {
  type GithubLinkResolution,
  resolveGithubLinkWorkflow,
  TaskWorkflowError,
} from "../../../../../../../lib/taskWorkflow";

interface RouteContext {
  params: Promise<{ id: string; taskId: string }>;
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  const { id, taskId } = await params;
  const resolution = (await request.json().catch(() => ({}))) as GithubLinkResolution;
  try {
    return NextResponse.json(await resolveGithubLinkWorkflow(id, taskId, resolution));
  } catch (error) {
    if (!(error instanceof TaskWorkflowError)) throw error;
    if (error.code === "project_not_found" || error.code === "task_not_found")
      return NextResponse.json({ error: error.message }, { status: 404 });
    if (error.code === "invalid_task")
      return NextResponse.json({ error: error.message }, { status: 400 });
    if (error.code === "github_link_not_uncertain" || error.code === "github_link_conflict")
      return NextResponse.json({ error: error.message }, { status: 409 });
    throw error;
  }
}
