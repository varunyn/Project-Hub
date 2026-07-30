import { randomUUID } from "node:crypto";
import { type NextRequest, NextResponse } from "next/server";
import type { ProjectTask } from "../../../../../types";
import { listGithubIssues } from "../../../../../utils/githubApi";
import { githubIssueToTaskFields, parseGithubRepository } from "../../../../../utils/githubSync";
import { getProjects } from "../../../../../utils/projectUtils";
import { createTask, getProjectTasks, updateTask } from "../../../../../utils/taskUtils";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(_request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
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

  try {
    const repository = parseGithubRepository(project.githubUrl);
    const issues = await listGithubIssues(
      repository.owner,
      repository.repo,
      process.env.GITHUB_TOKEN
    );
    const existing = getProjectTasks(id);
    let imported = 0;
    for (const issue of issues) {
      const fields = githubIssueToTaskFields(issue);
      const match = existing.find((task) => task.githubIssueNumber === issue.number);
      if (match) {
        await updateTask(id, match.id, fields);
      } else {
        const now = new Date().toISOString();
        const task: ProjectTask = {
          id: randomUUID(),
          projectId: id,
          ...fields,
          assigneeId: "",
          dueDate: "",
          position: existing.filter((item) => item.status === fields.status).length,
          createdAt: now,
          updatedAt: now,
        };
        await createTask(task);
        imported += 1;
      }
    }
    return NextResponse.json({ imported, updated: issues.length - imported, total: issues.length });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "GitHub sync failed" },
      { status: 502 }
    );
  }
}
