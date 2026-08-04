import fs from "node:fs";
import path from "node:path";
import type { Project } from "../../../types";

export type ScanMode = "discover" | "refresh";

export const MAX_DEPTH = 2;

export const PROJECT_MARKERS = [
  ".git",
  "package.json",
  "pyproject.toml",
  "requirements.txt",
  "Cargo.toml",
  "go.mod",
  "pom.xml",
  "Gemfile",
];

export function normalizePath(filePath: string): string {
  return path.normalize(path.resolve(/* turbopackIgnore: true */ filePath));
}

export function hasProjectMarker(dirPath: string): boolean {
  return PROJECT_MARKERS.some((marker) =>
    fs.existsSync(/* turbopackIgnore: true */ path.join(dirPath, marker))
  );
}

export function detectTechStack(dirPath: string): string[] {
  const techStack = new Set<string>();

  if (fs.existsSync(/* turbopackIgnore: true */ path.join(dirPath, "package.json"))) {
    techStack.add("JavaScript");
    try {
      const packageJson = JSON.parse(
        fs.readFileSync(/* turbopackIgnore: true */ path.join(dirPath, "package.json"), "utf8")
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
      if (
        deps.typescript ||
        fs.existsSync(/* turbopackIgnore: true */ path.join(dirPath, "tsconfig.json"))
      ) {
        techStack.add("TypeScript");
      }
    } catch (error) {
      console.warn("Failed to parse package.json during scan:", error);
    }
  }

  if (
    fs.existsSync(/* turbopackIgnore: true */ path.join(dirPath, "pyproject.toml")) ||
    fs.existsSync(/* turbopackIgnore: true */ path.join(dirPath, "requirements.txt"))
  ) {
    techStack.add("Python");
  }
  if (fs.existsSync(/* turbopackIgnore: true */ path.join(dirPath, "Cargo.toml")))
    techStack.add("Rust");
  if (fs.existsSync(/* turbopackIgnore: true */ path.join(dirPath, "go.mod"))) techStack.add("Go");
  if (fs.existsSync(/* turbopackIgnore: true */ path.join(dirPath, "pom.xml")))
    techStack.add("Java");
  if (fs.existsSync(/* turbopackIgnore: true */ path.join(dirPath, "Gemfile")))
    techStack.add("Ruby");

  return Array.from(techStack);
}

export function readProjectReadme(projectPath: string): string {
  try {
    const possibleNames = ["README.md", "Readme.md", "readme.md", "README.txt", "readme.txt"];

    for (const fileName of possibleNames) {
      const readmePath = path.join(/* turbopackIgnore: true */ projectPath, fileName);
      if (fs.existsSync(/* turbopackIgnore: true */ readmePath)) {
        return fs.readFileSync(/* turbopackIgnore: true */ readmePath, "utf8");
      }
    }

    return "";
  } catch (error) {
    console.error("Error reading README:", error);
    return "";
  }
}

export function listDirectories(rootPath: string): string[] {
  if (!fs.existsSync(/* turbopackIgnore: true */ rootPath)) return [];
  try {
    return fs
      .readdirSync(/* turbopackIgnore: true */ rootPath, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(/* turbopackIgnore: true */ rootPath, entry.name));
  } catch (error) {
    console.warn("Failed to read root directory during scan:", rootPath, error);
    return [];
  }
}

export function discoverProjectDirectories(rootPath: string): string[] {
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

interface MergeScannedProjectsOptions {
  existingProjects: Project[];
  discoveredPaths: string[];
  today: string;
  mode: ScanMode;
  resolveExistingProjectPath?: (project: Project) => string;
  resolveProjectPathForStorage?: (projectPath: string) => string;
  createProjectId?: (index: number) => string;
}

interface MergeScannedProjectsResult {
  projects: Project[];
  addedCount: number;
  refreshedCount: number;
}

export function mergeScannedProjects({
  existingProjects,
  discoveredPaths,
  today,
  mode,
  resolveExistingProjectPath = (project) => project.path,
  resolveProjectPathForStorage = (projectPath) => projectPath,
  createProjectId = (index) => `${Date.now()}-${index}`,
}: MergeScannedProjectsOptions): MergeScannedProjectsResult {
  const projects = existingProjects.map((project) => ({ ...project }));
  const existingPathIndex = new Map<string, number>();
  projects.forEach((project, index) => {
    existingPathIndex.set(normalizePath(resolveExistingProjectPath(project)), index);
  });

  let addedCount = 0;
  let refreshedCount = 0;
  const visitedDiscoveredPaths = new Set<string>();

  for (const projectPath of discoveredPaths) {
    const normalizedPath = normalizePath(projectPath);
    if (visitedDiscoveredPaths.has(normalizedPath)) continue;
    visitedDiscoveredPaths.add(normalizedPath);

    const existingIndex = existingPathIndex.get(normalizedPath);
    if (existingIndex !== undefined) {
      if (mode === "refresh") {
        const existingProject = projects[existingIndex];
        projects[existingIndex] = {
          ...existingProject,
          techStack: detectTechStack(projectPath),
          readmePreview: readProjectReadme(projectPath).slice(0, 280),
          lastUpdated: today,
        };
        refreshedCount += 1;
      }
      continue;
    }

    if (mode !== "discover") continue;

    const projectName = path.basename(projectPath);
    const readmePreview = readProjectReadme(projectPath).slice(0, 280);
    projects.push({
      id: createProjectId(addedCount),
      name: projectName,
      path: resolveProjectPathForStorage(projectPath),
      techStack: detectTechStack(projectPath),
      dateCreated: today,
      lastUpdated: today,
      readmePreview,
      status: "in progress",
      url: "",
    });
    addedCount += 1;
  }

  return { projects, addedCount, refreshedCount };
}
