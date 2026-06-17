import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import type { Project } from "../../../../types";
import { resolveProjectPathForServer } from "../../../../utils/projectUtils";

export interface GitCommit {
  hash: string;
  subject: string;
  date: string;
}

const DEFAULT_MAX_COMMITS = 10;
const FIELD_SEPARATOR = "\x1f";
const RECORD_SEPARATOR = "\x1e";

function hasGitDirectory(dir: string): boolean {
  const gitPath = path.join(dir, ".git");
  if (!fs.existsSync(gitPath)) return false;
  const stat = fs.statSync(gitPath);
  return stat.isDirectory() || stat.isFile();
}

interface GitLogTarget {
  cwd: string;
  limitToCurrentDirectory: boolean;
}

function gitRootForDirectory(dir: string): string | null {
  try {
    return execFileSync("git", ["rev-parse", "--show-toplevel"], {
      cwd: dir,
      encoding: "utf8",
      maxBuffer: 1024 * 1024,
    }).trim();
  } catch {
    return null;
  }
}

function realPathForComparison(dir: string): string {
  return path.resolve(fs.realpathSync(dir));
}

function findGitLogTarget(project: Pick<Project, "name" | "path">): GitLogTarget | null {
  const dir = resolveProjectPathForServer(project.path);
  if (!fs.existsSync(dir)) return null;

  const gitRoot = gitRootForDirectory(dir);
  if (gitRoot) {
    return {
      cwd: dir,
      limitToCurrentDirectory: realPathForComparison(gitRoot) !== realPathForComparison(dir),
    };
  }

  const children = fs.readdirSync(dir, { withFileTypes: true });
  const withGit = children.filter(
    (child) => child.isDirectory() && hasGitDirectory(path.join(dir, child.name))
  );
  if (withGit.length === 0) return null;
  if (withGit.length === 1) {
    return { cwd: path.join(dir, withGit[0].name), limitToCurrentDirectory: false };
  }

  const normalizedProjectName = project.name.toLowerCase().replace(/\s+/g, "-");
  const byName = withGit.find(
    (child) => child.name.toLowerCase().replace(/\s+/g, "-") === normalizedProjectName
  );

  return { cwd: path.join(dir, byName?.name ?? withGit[0].name), limitToCurrentDirectory: false };
}

function parseGitLog(output: string): GitCommit[] {
  const trimmed = output.trim();
  if (!trimmed) return [];

  return trimmed
    .split(RECORD_SEPARATOR)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [hash = "", subject = "", date = ""] = line.split(FIELD_SEPARATOR);
      return { hash: hash.trim(), subject: subject.trim(), date: date.trim() };
    });
}

function storedCommits(project: Pick<Project, "mockCommits">, maxCommits: number): GitCommit[] {
  return (project.mockCommits ?? []).slice(0, maxCommits);
}

export function getGitLogForProject({
  project,
  maxCommits = DEFAULT_MAX_COMMITS,
}: {
  project: Pick<Project, "name" | "path" | "mockCommits"> | null | undefined;
  maxCommits?: number;
}): GitCommit[] {
  if (!project?.path) return project ? storedCommits(project, maxCommits) : [];

  try {
    const target = findGitLogTarget(project);
    if (!target) return storedCommits(project, maxCommits);

    const output = execFileSync(
      "git",
      [
        "log",
        "-n",
        String(maxCommits),
        "--format=%h%x1f%s%x1f%ci%x1e",
        ...(target.limitToCurrentDirectory ? ["--", "."] : []),
      ],
      {
        cwd: target.cwd,
        encoding: "utf8",
        maxBuffer: 1024 * 1024,
      }
    );

    return parseGitLog(output);
  } catch (error) {
    console.error("[git-log] error:", error instanceof Error ? error.message : error);
    return storedCommits(project, maxCommits);
  }
}
