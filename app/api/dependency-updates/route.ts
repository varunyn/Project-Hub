import { NextResponse } from "next/server";
import {
  readConsolidatedDependencyReport,
  readDependencyReportForProject,
} from "../../lib/dependencyReport";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const projectPath = new URL(request.url).searchParams.get("projectPath")?.trim();
    const report = projectPath
      ? await readDependencyReportForProject(projectPath)
      : await readConsolidatedDependencyReport();
    return NextResponse.json(report);
  } catch (error) {
    console.error("Failed to read dependency report:", error);
    const message = error instanceof Error ? error.message : "Failed to read dependency report";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
