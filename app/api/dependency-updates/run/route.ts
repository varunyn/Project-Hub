import { NextResponse } from "next/server";
import { readLatestDependencyReport } from "../../../lib/dependencyReport";
import { runDependencyReporter } from "../../../lib/dependencyReportRunner";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const result = await runDependencyReporter();
    const report = await readLatestDependencyReport();
    return NextResponse.json({ result, report });
  } catch (error) {
    console.error("Failed to run dependency reporter:", error);
    const message = error instanceof Error ? error.message : "Failed to run dependency reporter";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
