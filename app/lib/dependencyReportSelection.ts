import type { DependencyProject, DependencyUpdatesReport } from "./dependencyReportTypes";

export interface DependencyReportSource {
  modifiedAt: number;
  report: DependencyUpdatesReport;
}

function calculateTotals(projects: DependencyProject[]): DependencyUpdatesReport["totals"] {
  return projects.reduce(
    (totals, project) => ({
      projects: totals.projects + 1,
      updates: totals.updates + project.updates.length,
      warnings: totals.warnings + project.warnings.length,
      errors: totals.errors + project.errors.length,
    }),
    { projects: 0, updates: 0, warnings: 0, errors: 0 }
  );
}

export function mergeDependencyReportSources(
  sources: DependencyReportSource[]
): DependencyUpdatesReport | null {
  const readySources = sources
    .filter((source) => source.report.status === "ready")
    .sort((a, b) => a.modifiedAt - b.modifiedAt);
  const latestSource = readySources.at(-1);
  if (!latestSource) return null;

  const projectsByPath = new Map<string, DependencyProject>();
  for (const source of readySources) {
    for (const project of source.report.projects) {
      projectsByPath.set(project.path, project);
    }
  }

  const projects = Array.from(projectsByPath.values()).sort((a, b) => a.path.localeCompare(b.path));

  return {
    ...latestSource.report,
    scanRoots: projects.map((project) => project.path),
    projects,
    totals: calculateTotals(projects),
  };
}

export function filterDependencyReportByProject(
  report: DependencyUpdatesReport,
  projectPath: string
): DependencyUpdatesReport {
  const normalizedPath = projectPath.replace(/\/+$/, "");
  const projects = report.projects.filter(
    (project) => {
      const candidatePath = project.path.replace(/\/+$/, "");
      return candidatePath === normalizedPath || candidatePath.startsWith(`${normalizedPath}/`);
    }
  );

  return {
    ...report,
    status: projects.length > 0 ? "ready" : "missing",
    scanRoots: projects.map((project) => project.path),
    projects,
    totals: calculateTotals(projects),
  };
}
