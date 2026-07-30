import { type NextRequest, NextResponse } from "next/server";
import { createGithubIssue } from "../../../../../../utils/githubApi";
import { parseGithubRepository, taskToGithubIssue } from "../../../../../../utils/githubSync";
import { getProjects } from "../../../../../../utils/projectUtils";
import { getProjectTasks, updateTask } from "../../../../../../utils/taskUtils";

interface RouteContext {
  params: Promise<{ id: string; taskId: string }>;
}

export async function POST(_request: NextRequest, { params }: RouteContext) {
  const { id, taskId } = await params;
  const project = getProjects().find((item) => item.id === id);
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
  if (!process.env.GITHUB_TOKEN) {
    return NextResponse.json({ error: "Set GITHUB_TOKEN to use GitHub sync" }, { status: 503 });
  }
  if (!project.githubUrl) {
    return NextResponse.json(
      { error: "Add a GitHub repository URL to this project first" },
      { status: 400 }
    );
  }
  const task = getProjectTasks(id).find((item) => item.id === taskId);
  if (!task) return NextResponse.json({ error: "Task not found" }, { status: 404 });
  if (task.githubIssueNumber) return NextResponse.json(task);

  try {
    const repository = parseGithubRepository(project.githubUrl);
    const issue = await createGithubIssue(
      repository.owner,
      repository.repo,
      process.env.GITHUB_TOKEN,
      taskToGithubIssue(task)
    );
    const updated = await updateTask(id, taskId, {
      githubIssueNumber: issue.number,
      githubIssueUrl: issue.html_url,
    });
    return NextResponse.json(updated);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "GitHub issue creation failed" },
      { status: 502 }
    );
  }
}
