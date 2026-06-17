import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { getProjects, resolveProjectPathForServer, setProjects } from "../../../utils/projectUtils";
import {
  discoverProjectDirectories,
  mergeScannedProjects,
  normalizePath,
  type ScanMode,
} from "./scanCore";

function resolveScanRoots(): string[] {
  const roots = [
    process.env.CONTAINER_PROJECTS_ROOT,
    process.env.HOST_PROJECTS_PATH,
    process.env.HOST_PROJECTS_ROOT,
  ]
    .filter((value): value is string => Boolean(value?.trim()))
    .map((value) => normalizePath(value));
  return Array.from(new Set(roots));
}

function resolveProjectPathForStorage(projectPath: string): string {
  const hostRoot = process.env.HOST_PROJECTS_ROOT;
  const containerRoot = process.env.CONTAINER_PROJECTS_ROOT;
  if (hostRoot && containerRoot) {
    const normalized = normalizePath(projectPath);
    const normalizedContainerRoot = normalizePath(containerRoot);
    const relative = path.relative(normalizedContainerRoot, normalized);
    if (!(relative.startsWith("..") || path.isAbsolute(relative))) {
      return path.join(hostRoot, relative);
    }
  }
  return projectPath;
}

async function readScanMode(request: Request): Promise<ScanMode> {
  try {
    const body = (await request.json()) as { mode?: string };
    return body.mode === "refresh" ? "refresh" : "discover";
  } catch {
    return "discover";
  }
}

export async function POST(request: Request) {
  try {
    const mode = await readScanMode(request);
    const scanRoots = resolveScanRoots();
    console.info("[scan-projects] Starting scan", {
      mode,
      configuredRoots: scanRoots,
      containerRoot: process.env.CONTAINER_PROJECTS_ROOT ?? null,
      hostRoot: process.env.HOST_PROJECTS_ROOT ?? process.env.HOST_PROJECTS_PATH ?? null,
    });
    if (scanRoots.length === 0) {
      return NextResponse.json(
        {
          error:
            "Project scan root is not configured. Set HOST_PROJECTS_PATH (and CONTAINER_PROJECTS_ROOT in Docker) in your .env file.",
        },
        { status: 400 }
      );
    }

    const existingProjects = getProjects();
    const discoveredPaths = new Set<string>();

    let accessibleRootCount = 0;
    for (const rootPath of scanRoots) {
      if (!fs.existsSync(rootPath)) {
        console.warn("[scan-projects] Scan root not accessible", { rootPath });
        continue;
      }
      accessibleRootCount += 1;
      const candidates = discoverProjectDirectories(rootPath);
      for (const candidate of candidates) {
        discoveredPaths.add(candidate);
      }
    }

    if (accessibleRootCount === 0) {
      return NextResponse.json(
        {
          error:
            "Configured scan roots are not accessible from this runtime. In Docker, verify CONTAINER_PROJECTS_ROOT points to your mounted volume (e.g. /projects).",
        },
        { status: 400 }
      );
    }

    const today = new Date().toISOString().split("T")[0];
    const result = mergeScannedProjects({
      existingProjects,
      discoveredPaths: Array.from(discoveredPaths),
      today,
      mode,
      resolveExistingProjectPath: (project) => resolveProjectPathForServer(project.path),
      resolveProjectPathForStorage,
      createProjectId: (index) => `${Date.now()}-${index}`,
    });

    const updatedProjects = await setProjects(result.projects);
    console.info("[scan-projects] Scan completed", {
      mode,
      discovered: discoveredPaths.size,
      added: result.addedCount,
      refreshed: result.refreshedCount,
      total: updatedProjects.length,
    });
    return NextResponse.json(updatedProjects);
  } catch (error) {
    console.error("Failed to scan projects:", error);
    return NextResponse.json({ error: "Failed to scan projects" }, { status: 500 });
  }
}
