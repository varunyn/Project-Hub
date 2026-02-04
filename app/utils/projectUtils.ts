import fs from "node:fs";
import path from "node:path";
import type { Project } from "../types";

const dataDir = path.join(process.cwd(), "app/data");
const projectsFilePath = path.join(dataDir, "projects.json");

export function resolveProjectPathForServer(projectPath: string): string {
  const hostRoot = process.env.HOST_PROJECTS_ROOT;
  const containerRoot = process.env.CONTAINER_PROJECTS_ROOT;
  if (
    hostRoot &&
    containerRoot &&
    path.normalize(projectPath).startsWith(path.normalize(hostRoot))
  ) {
    const normalized = path.normalize(projectPath);
    const relative = path.relative(path.normalize(hostRoot), normalized);
    return path.join(containerRoot, relative);
  }
  return path.resolve(projectPath);
}

function ensureDataDirExists() {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  if (!fs.existsSync(projectsFilePath)) {
    fs.writeFileSync(projectsFilePath, "[]", "utf8");
  }
}

export function getProjects(): Project[] {
  ensureDataDirExists();

  try {
    const projectsData = fs.readFileSync(projectsFilePath, "utf8");
    return JSON.parse(projectsData);
  } catch (error) {
    console.error("Error reading projects:", error);
    return [];
  }
}

function saveProjects(projects: Project[]): void {
  try {
    fs.writeFileSync(projectsFilePath, JSON.stringify(projects, null, 2), "utf8");
  } catch (error) {
    console.error("Error saving projects:", error);
  }
}

export function addProject(project: Project): Project[] {
  const projects = getProjects();
  const newProjects = [...projects, project];
  saveProjects(newProjects);
  return newProjects;
}

export function updateProject(id: string, partial: Partial<Project>): Project[] {
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
}

export function deleteProject(id: string): Project[] {
  const projects = getProjects();
  const newProjects = projects.filter((project) => project.id !== id);
  saveProjects(newProjects);
  return newProjects;
}

export function readProjectReadme(projectPath: string): string {
  try {
    const possibleNames = ["README.md", "Readme.md", "readme.md", "README.txt", "readme.txt"];

    for (const fileName of possibleNames) {
      const readmePath = path.join(projectPath, fileName);
      if (fs.existsSync(readmePath)) {
        return fs.readFileSync(readmePath, "utf8");
      }
    }

    return "";
  } catch (error) {
    console.error("Error reading README:", error);
    return "";
  }
}
