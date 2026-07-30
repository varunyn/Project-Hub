import type { ProjectTask, TaskPriority, TaskStatus } from "../types";

export interface GithubIssue {
  number: number;
  title: string;
  body: string | null;
  state: "open" | "closed";
  html_url: string;
  labels: Array<{ name: string }>;
}

const statuses: TaskStatus[] = ["backlog", "todo", "in-progress", "review", "done"];
const priorities: TaskPriority[] = ["low", "medium", "high"];

export function parseGithubRepository(githubUrl: string) {
  const url = new URL(githubUrl);
  if (url.hostname !== "github.com") throw new Error("Project GitHub URL must use github.com");
  const parts = url.pathname.split("/").filter(Boolean);
  if (parts.length < 2) throw new Error("Project GitHub URL must include owner and repository");
  return { owner: parts[0], repo: parts[1].replace(/\.git$/, "") };
}

export function githubIssueToTaskFields(issue: GithubIssue) {
  const labels = issue.labels.map((label) => label.name);
  const statusLabel = labels.find((label) => label.startsWith("status:"))?.slice(7);
  const priorityLabel = labels.find((label) => label.startsWith("priority:"))?.slice(9);
  const status =
    issue.state === "closed"
      ? "done"
      : statuses.includes(statusLabel as TaskStatus)
        ? statusLabel
        : "todo";
  const priority = priorities.includes(priorityLabel as TaskPriority) ? priorityLabel : "medium";
  return {
    title: issue.title,
    description: issue.body ?? "",
    status: status as TaskStatus,
    priority: priority as TaskPriority,
    labels: labels.filter(
      (label) => !(label.startsWith("status:") || label.startsWith("priority:"))
    ),
    githubIssueNumber: issue.number,
    githubIssueUrl: issue.html_url,
  };
}

export function taskToGithubIssue(
  task: Pick<ProjectTask, "title" | "description" | "status" | "labels">
) {
  return {
    title: task.title,
    body: task.description,
    labels: [...task.labels, `status:${task.status}`],
  };
}

export function githubIssueStateForTask(status: TaskStatus): "open" | "closed" {
  return status === "done" ? "closed" : "open";
}

export function githubStatusLabelForTask(status: TaskStatus): string {
  return `status:${status}`;
}
