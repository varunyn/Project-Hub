import { NextResponse } from "next/server";
import {
  getDependencyReportAiAvailability,
  getDependencyReportAiPreferences,
  saveDependencyReportAiPreferences,
} from "../../../lib/dependencyReportAiPreferences";

export const dynamic = "force-dynamic";

function response() {
  const availability = getDependencyReportAiAvailability();
  const preference = getDependencyReportAiPreferences();
  return NextResponse.json({
    ...availability,
    ...preference,
    // Availability is an authoritative ceiling, including for an old saved true value.
    aiEnabled: availability.aiAvailable && preference.aiEnabled,
  });
}

export async function GET() {
  return response();
}

export async function PUT(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as { aiEnabled?: unknown };
    if (typeof body.aiEnabled !== "boolean")
      return NextResponse.json({ error: "aiEnabled must be a boolean." }, { status: 400 });
    if (body.aiEnabled && !getDependencyReportAiAvailability().aiAvailable) {
      return NextResponse.json(
        {
          error:
            "AI suggestions are unavailable because AI is disabled for this Project Hub instance.",
        },
        { status: 400 }
      );
    }
    saveDependencyReportAiPreferences(body.aiEnabled);
    return response();
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to save AI preference." },
      { status: 400 }
    );
  }
}

export const POST = PUT;
