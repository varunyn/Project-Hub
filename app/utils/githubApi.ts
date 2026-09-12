import type { GithubIssue } from "./githubSync";

/** A GitHub API call that completed with a non-success HTTP response. */
export class GithubApiError extends Error {
  readonly outcome = "definite-failure" as const;
  readonly status: number;

  constructor(operation: string, status: number) {
    super(`GitHub ${operation} failed (${status})`);
    this.name = "GithubApiError";
    this.status = status;
  }
}

export function isUncertainGithubCreateStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

const githubHeaders = (token: string) => ({
  Accept: "application/vnd.github+json",
  Authorization: `Bearer ${token}`,
  "X-GitHub-Api-Version": "2022-11-28",
});

export async function listGithubIssues(
  owner: string,
  repo: string,
  token: string
): Promise<GithubIssue[]> {
  const response = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/issues?state=all&per_page=100`,
    {
      headers: githubHeaders(token),
      cache: "no-store",
    }
  );
  if (!response.ok) throw new GithubApiError("issue sync", response.status);
  const issues = (await response.json()) as GithubIssue[];
  return issues.filter((issue) => !("pull_request" in issue));
}

export async function createGithubIssue(
  owner: string,
  repo: string,
  token: string,
  input: { title: string; body: string; labels: string[] }
): Promise<GithubIssue> {
  const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/issues`, {
    method: "POST",
    headers: { ...githubHeaders(token), "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok) throw new GithubApiError("issue creation", response.status);
  return (await response.json()) as GithubIssue;
}

export async function updateGithubIssueState(
  owner: string,
  repo: string,
  issueNumber: number,
  token: string,
  state: "open" | "closed",
  labels: string[]
): Promise<void> {
  const response = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}`,
    {
      method: "PATCH",
      headers: { ...githubHeaders(token), "Content-Type": "application/json" },
      body: JSON.stringify({ state, labels }),
    }
  );
  if (!response.ok) throw new GithubApiError("issue update", response.status);
}

export async function getGithubIssue(
  owner: string,
  repo: string,
  issueNumber: number,
  token: string
): Promise<GithubIssue> {
  const response = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}`,
    { headers: githubHeaders(token), cache: "no-store" }
  );
  if (!response.ok) throw new GithubApiError("issue lookup", response.status);
  return (await response.json()) as GithubIssue;
}

export async function ensureGithubLabel(
  owner: string,
  repo: string,
  token: string,
  name: string,
  color: string
): Promise<void> {
  const labelUrl = `https://api.github.com/repos/${owner}/${repo}/labels/${encodeURIComponent(name)}`;
  const existing = await fetch(labelUrl, { headers: githubHeaders(token), cache: "no-store" });
  if (existing.ok) return;
  if (existing.status !== 404) throw new GithubApiError("label lookup", existing.status);
  const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/labels`, {
    method: "POST",
    headers: { ...githubHeaders(token), "Content-Type": "application/json" },
    body: JSON.stringify({ name, color }),
  });
  if (!response.ok && response.status !== 422) {
    throw new GithubApiError("label creation", response.status);
  }
}
