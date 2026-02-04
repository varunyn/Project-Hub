import { type NextRequest, NextResponse } from "next/server";
import {
  getProjects,
  readProjectReadme,
  resolveProjectPathForServer,
} from "../../../../utils/projectUtils";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    const projects = getProjects();
    const project = projects.find((p) => p.id === id);

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    if (!project.path) {
      return NextResponse.json({ error: "Project has no path defined" }, { status: 400 });
    }

    const readmeContent = readProjectReadme(resolveProjectPathForServer(project.path));
    return NextResponse.json({ content: readmeContent });
  } catch (error) {
    console.error("Error fetching README:", error);
    return NextResponse.json({ error: "Failed to fetch README content" }, { status: 500 });
  }
}
