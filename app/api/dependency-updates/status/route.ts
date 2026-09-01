import { NextResponse } from "next/server";
import { getDependencyReportJob } from "../../../lib/dependencyReportJob";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json({ job: getDependencyReportJob() });
  } catch (error) {
    console.error("Failed to read dependency report status:", error);
    const message =
      error instanceof Error ? error.message : "Failed to read dependency report status";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
