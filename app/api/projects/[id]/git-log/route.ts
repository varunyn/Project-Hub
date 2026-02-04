import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { type NextRequest, NextResponse } from "next/server";
import { getProjects, resolveProjectPathForServer } from "../../../../utils/projectUtils";

const MAX_COMMITS = 10;

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    console.log("[git-log] GET project id:", id);
    const projects = getProjects();
    const project = projects.find((p) => p.id === id);
    if (!project?.path) {
      console.log("[git-log] No project or path for id:", id);
      return NextResponse.json({ commits: [] });
    }

    const dir = resolveProjectPathForServer(project.path);
    const dirExists = fs.existsSync(dir);
    if (!dirExists) {
      console.log("[git-log] Project directory does not exist on server:", dir);
      return NextResponse.json({ commits: [] });
    }

    function hasGit(d: string): boolean {
      const g = path.join(d, ".git");
      if (!fs.existsSync(g)) return false;
      const st = fs.statSync(g);
      return st.isDirectory() || st.isFile();
    }

    let workDir = dir;
    const gitDirHere = path.join(dir, ".git");
    if (fs.existsSync(gitDirHere)) {
      workDir = dir;
    } else {
      const children = fs.readdirSync(dir, { withFileTypes: true });
      const withGit = children.filter((c) => c.isDirectory() && hasGit(path.join(dir, c.name)));
      if (withGit.length === 1) {
        workDir = path.join(dir, withGit[0].name);
        console.log("[git-log] Using subdirectory as git root:", workDir);
      } else if (withGit.length > 1) {
        const byName = withGit.find(
          (c) =>
            c.name.toLowerCase().replace(/\s+/g, "-") ===
            project.name.toLowerCase().replace(/\s+/g, "-"),
        );
        if (byName) workDir = path.join(dir, byName.name);
        else workDir = path.join(dir, withGit[0].name);
        console.log("[git-log] Multiple git dirs, using:", workDir);
      } else {
        console.log("[git-log] No .git in dir or subdirs:", dir);
        return NextResponse.json({ commits: [] });
      }
    }

    const format = "%h|%s|%ci";
    const out = execSync(`git log -n ${MAX_COMMITS} --format=${JSON.stringify(format)}`, {
      cwd: workDir,
      encoding: "utf8",
      maxBuffer: 1024 * 1024,
    }).trim();

    const commits = out
      ? out.split("\n").map((line) => {
          const parts = line.split("|");
          const hash = parts[0]?.trim() ?? "";
          const date = parts[parts.length - 1]?.trim() ?? "";
          const subject =
            parts.length > 2 ? parts.slice(1, -1).join("|").trim() : (parts[1]?.trim() ?? "");
          return { hash, subject, date };
        })
      : [];

    console.log("[git-log] commits count:", commits.length);
    return NextResponse.json({ commits });
  } catch (err) {
    console.error("[git-log] error:", err instanceof Error ? err.message : err);
    if (err instanceof Error && err.stack) console.error("[git-log] stack:", err.stack);
    return NextResponse.json({ commits: [] });
  }
}
