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

    const isDarwin = process.platform === "darwin";
    if (isDarwin) {
      await execAsync(`open -a "Cursor" "${path}"`);
    } else {
      await execAsync(`cursor "${path}"`);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error opening in Cursor:", error);
    return NextResponse.json({ error: "Failed to open in Cursor" }, { status: 500 });
  }
}
