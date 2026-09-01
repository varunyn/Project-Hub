import { NextResponse } from "next/server";
import { startDependencyReportJob } from "../../../lib/dependencyReportJob";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      projectPath?: unknown;
      aiEnabled?: unknown;
    };
    const projectPath = typeof body.projectPath === "string" ? body.projectPath : undefined;
    if (body.aiEnabled !== undefined && typeof body.aiEnabled !== "boolean") {
      return NextResponse.json({ error: "aiEnabled must be a boolean." }, { status: 400 });
    }
    const aiEnabled = typeof body.aiEnabled === "boolean" ? body.aiEnabled : undefined;
    const job = startDependencyReportJob(projectPath, aiEnabled);
    return NextResponse.json({ job }, { status: 202 });
  } catch (error) {
    console.error("Failed to run dependency reporter:", error);
    const message = error instanceof Error ? error.message : "Failed to run dependency reporter";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
