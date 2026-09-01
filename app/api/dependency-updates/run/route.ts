import { NextResponse } from "next/server";
import { startDependencyReportJob } from "../../../lib/dependencyReportJob";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as { projectPath?: unknown };
    const projectPath = typeof body.projectPath === "string" ? body.projectPath : undefined;
    const job = startDependencyReportJob(projectPath);
    return NextResponse.json({ job }, { status: 202 });
  } catch (error) {
    console.error("Failed to run dependency reporter:", error);
    const message = error instanceof Error ? error.message : "Failed to run dependency reporter";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
