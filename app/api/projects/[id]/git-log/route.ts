import { type NextRequest, NextResponse } from "next/server";
import { getProjects } from "../../../../utils/projectUtils";
import { getGitLogForProject } from "./gitLog";

const MAX_COMMITS = 10;
const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
};

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    console.log("[git-log] GET project id:", id);
    const projects = getProjects();
    const project = projects.find((p) => p.id === id);

    const commits = getGitLogForProject({ project, maxCommits: MAX_COMMITS });
    console.log("[git-log] commits count:", commits.length);
    return NextResponse.json({ commits }, { headers: NO_STORE_HEADERS });
  } catch (err) {
    console.error("[git-log] error:", err instanceof Error ? err.message : err);
    if (err instanceof Error && err.stack) console.error("[git-log] stack:", err.stack);
    return NextResponse.json({ commits: [] }, { headers: NO_STORE_HEADERS });
  }
}
