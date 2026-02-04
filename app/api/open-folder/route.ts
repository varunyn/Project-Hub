import { exec } from "node:child_process";
import { promisify } from "node:util";
import { type NextRequest, NextResponse } from "next/server";

const execAsync = promisify(exec);

export async function POST(request: NextRequest) {
  try {
    const { path } = await request.json();

    if (!path) {
      return NextResponse.json({ error: "No path provided" }, { status: 400 });
    }
    if (!/^[a-zA-Z0-9\s/._-]+$/.test(path)) {
      return NextResponse.json({ error: "Invalid path format" }, { status: 400 });
    }

    if (process.platform !== "darwin") {
      return NextResponse.json(
        {
          error:
            "Open folder is not available on this system (e.g. when running in Docker). Use Copy path instead.",
        },
        { status: 503 },
      );
    }

    await execAsync(`open "${path}"`);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error opening folder:", error);
    const message = error instanceof Error ? error.message : "";
    const notAvailable =
      message.includes("not found") || message.includes("ENOENT") || message.includes("127");
    return NextResponse.json(
      {
        error: notAvailable
          ? "Open folder is not available (e.g. when running in Docker). Use Copy path instead."
          : "Failed to open folder",
      },
      { status: notAvailable ? 503 : 500 },
    );
  }
}
