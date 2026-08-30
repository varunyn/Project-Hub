import fs from "node:fs";
import path from "node:path";
import type { Project } from "../types";
import { withFileLock } from "./fileLock";

const dataDir = process.env.PROJECT_DATA_DIR || path.join(process.cwd(), "app", "data");
const projectsFilePath = path.join(dataDir, "projects.json");

export function resolveProjectPathForServer(projectPath: string): string {
  const hostRoot = process.env.HOST_PROJECTS_ROOT;
  const containerRoot = process.env.CONTAINER_PROJECTS_ROOT;
  if (hostRoot && containerRoot) {
    const normalized = path.normalize(projectPath);
    const normalizedHostRoot = path.normalize(hostRoot);
    const relative = path.relative(normalizedHostRoot, normalized);
    if (!(relative.startsWith("..") || path.isAbsolute(relative))) {
      return path.join(containerRoot, relative);
    }
  }
  return path.resolve(/* turbopackIgnore: true */ projectPath);
}

function ensureDataDirExists() {
  if (!fs.existsSync(/* turbopackIgnore: true */ dataDir)) {
    fs.mkdirSync(/* turbopackIgnore: true */ dataDir, { recursive: true });
  }

  if (!fs.existsSync(/* turbopackIgnore: true */ projectsFilePath)) {
    fs.writeFileSync(/* turbopackIgnore: true */ projectsFilePath, "[]", "utf8");
  }
}

export function getProjects(): Project[] {
  ensureDataDirExists();

  try {
    const projectsData = fs.readFileSync(/* turbopackIgnore: true */ projectsFilePath, "utf8");
    return JSON.parse(projectsData);
  } catch (error) {
    console.error("Error reading projects:", error);
    return [];
  }
}

function saveProjects(projects: Project[]): void {
  try {
    const temporaryPath = `${projectsFilePath}.${process.pid}.tmp`;
    fs.writeFileSync(temporaryPath, JSON.stringify(projects, null, 2), "utf8");
    fs.renameSync(temporaryPath, projectsFilePath);
  } catch (error) {
    console.error("Error saving projects:", error);
  }
}

let projectsWriteQueue: Promise<void> = Promise.resolve();

async function queueProjectsWrite<T>(operation: () => T): Promise<T> {
  const queuedOperation = projectsWriteQueue.then(async () => operation());
  projectsWriteQueue = queuedOperation.then(
    () => undefined,
    () => undefined
  );
  return queuedOperation;
}

export async function setProjects(projects: Project[]): Promise<Project[]> {
  return queueProjectsWrite(() =>
    withFileLock(projectsFilePath, () => {
      saveProjects(projects);
      return projects;
    })
  );
}

export async function addProject(project: Project): Promise<Project[]> {
  return queueProjectsWrite(() =>
    withFileLock(projectsFilePath, () => {
      const projects = getProjects();
      const newProjects = [...projects, project];
      saveProjects(newProjects);
      return newProjects;
    })
  );
}

export async function updateProject(id: string, partial: Partial<Project>): Promise<Project[]> {
  return queueProjectsWrite(() =>
    withFileLock(projectsFilePath, () => {
      const projects = getProjects();
      const existing = projects.find((p) => p.id === id);
      if (!existing) return projects;
      const lastUpdated = new Date().toISOString().split("T")[0];
      const updatedProject: Project = {
        ...existing,
        ...partial,
        id: existing.id,
        dateCreated: existing.dateCreated,
        lastUpdated,
      };
      const newProjects = projects.map((p) => (p.id === id ? updatedProject : p));
      saveProjects(newProjects);
      return newProjects;
    })
  );
}

export async function deleteProject(id: string): Promise<Project[]> {
  return queueProjectsWrite(() =>
    withFileLock(projectsFilePath, () => {
      const projects = getProjects();
      const newProjects = projects.filter((project) => project.id !== id);
      saveProjects(newProjects);
      return newProjects;
    })
  );
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
