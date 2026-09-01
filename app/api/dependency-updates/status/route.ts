import { NextResponse } from "next/server";
import { readLatestDependencyReport } from "../../../lib/dependencyReport";
import { getDependencyReportJob } from "../../../lib/dependencyReportJob";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [job, report] = await Promise.all([
      Promise.resolve(getDependencyReportJob()),
      readLatestDependencyReport(),
    ]);
    return NextResponse.json({ job, report });
  } catch (error) {
    console.error("Failed to read dependency report status:", error);
    const message =
      error instanceof Error ? error.message : "Failed to read dependency report status";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
