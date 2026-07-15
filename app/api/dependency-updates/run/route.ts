import { NextResponse } from "next/server";
import { readLatestDependencyReport } from "../../../lib/dependencyReport";
import { runDependencyReporter } from "../../../lib/dependencyReportRunner";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as { projectPath?: unknown };
    const projectPath = typeof body.projectPath === "string" ? body.projectPath : undefined;
    const result = await runDependencyReporter(projectPath);
    const report = await readLatestDependencyReport(result.outputDir);
    return NextResponse.json({ result, report });
  } catch (error) {
    console.error("Failed to run dependency reporter:", error);
    const message = error instanceof Error ? error.message : "Failed to run dependency reporter";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
