import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import type { Project } from "../../../types";
import {
  getProjects,
  readProjectReadme,
  resolveProjectPathForServer,
  setProjects,
} from "../../../utils/projectUtils";

const MAX_DEPTH = 2;

const PROJECT_MARKERS = [
  ".git",
  "package.json",
  "pyproject.toml",
  "requirements.txt",
  "Cargo.toml",
  "go.mod",
  "pom.xml",
  "Gemfile",
];

function normalizePath(filePath: string): string {
  return path.normalize(path.resolve(filePath));
}

function hasProjectMarker(dirPath: string): boolean {
  return PROJECT_MARKERS.some((marker) => fs.existsSync(path.join(dirPath, marker)));
}

function detectTechStack(dirPath: string): string[] {
  const techStack = new Set<string>();

  if (fs.existsSync(path.join(dirPath, "package.json"))) {
    techStack.add("JavaScript");
    try {
      const packageJson = JSON.parse(
        fs.readFileSync(path.join(dirPath, "package.json"), "utf8"),
      ) as {
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      };
      const deps = {
        ...packageJson.dependencies,
        ...packageJson.devDependencies,
      };
      if (deps.react) techStack.add("React");
      if (deps.next) techStack.add("Next.js");
      if (deps.typescript || fs.existsSync(path.join(dirPath, "tsconfig.json"))) {
        techStack.add("TypeScript");
      }
    } catch (error) {
      console.warn("Failed to parse package.json during scan:", error);
    }
  }

  if (
    fs.existsSync(path.join(dirPath, "pyproject.toml")) ||
    fs.existsSync(path.join(dirPath, "requirements.txt"))
  ) {
    techStack.add("Python");
  }
  if (fs.existsSync(path.join(dirPath, "Cargo.toml"))) techStack.add("Rust");
  if (fs.existsSync(path.join(dirPath, "go.mod"))) techStack.add("Go");
  if (fs.existsSync(path.join(dirPath, "pom.xml"))) techStack.add("Java");
  if (fs.existsSync(path.join(dirPath, "Gemfile"))) techStack.add("Ruby");

  return Array.from(techStack);
}

function listDirectories(rootPath: string): string[] {
  if (!fs.existsSync(rootPath)) return [];
  try {
    return fs
      .readdirSync(rootPath, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(rootPath, entry.name));
  } catch (error) {
    console.warn("Failed to read root directory during scan:", rootPath, error);
    return [];
  }
}

function discoverProjectDirectories(rootPath: string): string[] {
  const discovered: string[] = [];
  const queue: Array<{ dirPath: string; depth: number }> = [{ dirPath: rootPath, depth: 0 }];
  const visited = new Set<string>();

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) continue;

    const normalized = normalizePath(current.dirPath);
    if (visited.has(normalized)) continue;
    visited.add(normalized);

    if (hasProjectMarker(normalized)) {
      discovered.push(normalized);
      continue;
    }

    if (current.depth >= MAX_DEPTH) continue;

    const childDirs = listDirectories(normalized);
    for (const child of childDirs) {
      const baseName = path.basename(child);
      if (baseName.startsWith(".")) continue;
      queue.push({ dirPath: child, depth: current.depth + 1 });
    }
  }

  return discovered;
}

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
    if (!relative.startsWith("..") && !path.isAbsolute(relative)) {
      return path.join(hostRoot, relative);
    }
  }
  return projectPath;
}

export async function POST() {
  try {
    const scanRoots = resolveScanRoots();
    console.info("[scan-projects] Starting scan", {
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
        { status: 400 },
      );
    }

    const existingProjects = getProjects();
    const existingPaths = new Set(
      existingProjects.map((project) => normalizePath(resolveProjectPathForServer(project.path))),
    );
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
        { status: 400 },
      );
    }

    const today = new Date().toISOString().split("T")[0];
    const newProjects: Project[] = [];
    for (const projectPath of discoveredPaths) {
      if (existingPaths.has(projectPath)) continue;

      const projectName = path.basename(projectPath);
      const readmePreview = readProjectReadme(projectPath).slice(0, 280);
      newProjects.push({
        id: `${Date.now()}-${newProjects.length}`,
        name: projectName,
        path: resolveProjectPathForStorage(projectPath),
        techStack: detectTechStack(projectPath),
        dateCreated: today,
        lastUpdated: today,
        readmePreview,
        status: "in progress",
        url: "",
      });
    }

    const updatedProjects = await setProjects([...existingProjects, ...newProjects]);
    console.info("[scan-projects] Scan completed", {
      discovered: discoveredPaths.size,
      added: newProjects.length,
      total: updatedProjects.length,
    });
    return NextResponse.json(updatedProjects);
  } catch (error) {
    console.error("Failed to scan projects:", error);
    return NextResponse.json({ error: "Failed to scan projects" }, { status: 500 });
  }
}
