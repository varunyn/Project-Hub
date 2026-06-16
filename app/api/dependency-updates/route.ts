import { NextResponse } from "next/server";
import { readLatestDependencyReport } from "../../lib/dependencyReport";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const report = await readLatestDependencyReport();
    return NextResponse.json(report);
  } catch (error) {
    console.error("Failed to read dependency report:", error);
    const message = error instanceof Error ? error.message : "Failed to read dependency report";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
