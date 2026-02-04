import { type NextRequest, NextResponse } from "next/server";
import { addProject, getProjects } from "../../utils/projectUtils";

export async function GET() {
  const projects = getProjects();
  return NextResponse.json(projects);
}

export async function POST(request: NextRequest) {
  try {
    const newProject = await request.json();
    newProject.id = Date.now().toString();
    if (!newProject.dateCreated) {
      const today = new Date().toISOString().split("T")[0];
      newProject.dateCreated = today;
      newProject.lastUpdated = today;
    }

    const updatedProjects = addProject(newProject);
    return NextResponse.json(updatedProjects);
  } catch (err) {
    console.error("Failed to add project:", err);
    return NextResponse.json({ error: "Failed to add project" }, { status: 400 });
  }
}
