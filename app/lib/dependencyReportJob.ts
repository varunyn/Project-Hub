import "server-only";

import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  getDependencyReportAiAvailability,
  resolveDependencyReportAiEnabled,
} from "./dependencyReportAiPreferences";
import { type DependencyReportProgress, runDependencyReporter } from "./dependencyReportRunner";

export type DependencyReportJobStatus = "idle" | "running" | "succeeded" | "failed" | "interrupted";

export interface DependencyReportJob {
  id: string | null;
  status: DependencyReportJobStatus;
  scope: string | null;
  projectPath: string | null;
  startedAt: string | null;
  completedAt: string | null;
  error: string | null;
  aiEnabled: boolean;
  aiAvailable: boolean;
  phase: "scanning" | "release_lookup" | "ai_enrichment" | "finalizing" | null;
  completed: number;
  total: number;
}

const defaultJob: DependencyReportJob = {
  id: null,
  status: "idle",
  scope: null,
  projectPath: null,
  startedAt: null,
  completedAt: null,
  error: null,
  aiEnabled: false,
  aiAvailable: false,
  phase: null,
  completed: 0,
  total: 0,
};

let activeJobId: string | null = null;

function jobFilePath(): string {
  const dataDir = process.env.PROJECT_DATA_DIR || path.join(process.cwd(), "app", "data");
  return process.env.DEPENDENCY_REPORT_JOB_FILE || path.join(dataDir, "dependency-report-job.json");
}

function readStoredJob(): DependencyReportJob {
  try {
    const value = JSON.parse(
      fs.readFileSync(/* turbopackIgnore: true */ jobFilePath(), "utf8")
    ) as Partial<DependencyReportJob>;
    const job = { ...defaultJob, ...value };
    if (job.status === "running" && job.id !== activeJobId) {
      const interrupted = {
        ...job,
        status: "interrupted" as const,
        completedAt: new Date().toISOString(),
        error: "The report process was interrupted by a server restart.",
      };
      writeStoredJob(interrupted);
      return interrupted;
    }
    return job;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { ...defaultJob };
    console.error("Failed to read dependency report job:", error);
    return { ...defaultJob };
  }
}

function writeStoredJob(job: DependencyReportJob): void {
  const file = jobFilePath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(job, null, 2), "utf8");
  fs.renameSync(temporary, file);
}

export function getDependencyReportJob(): DependencyReportJob {
  return readStoredJob();
}

export function startDependencyReportJob(
  projectPath?: string,
  requestedAiEnabled?: boolean
): DependencyReportJob {
  const current = readStoredJob();
  if (current.status === "running") return current;

  const availability = getDependencyReportAiAvailability();
  const aiEnabled = resolveDependencyReportAiEnabled(requestedAiEnabled);
  const now = new Date().toISOString();
  const job: DependencyReportJob = {
    id: randomUUID(),
    status: "running",
    scope: projectPath || "all",
    projectPath: projectPath || null,
    startedAt: now,
    completedAt: null,
    error: null,
    aiEnabled,
    aiAvailable: availability.aiAvailable,
    phase: "scanning",
    completed: 0,
    total: 0,
  };
  activeJobId = job.id;
  writeStoredJob(job);

  // Deliberately do not await: the API acknowledges the durable job immediately.
  const updateProgress = (progress: DependencyReportProgress) => {
    const currentJob = readStoredJob();
    if (currentJob.id !== job.id || currentJob.status !== "running") return;
    writeStoredJob({
      ...currentJob,
      phase: progress.phase,
      completed: progress.completed,
      total: progress.total,
    });
  };
  runDependencyReporter(projectPath, aiEnabled, updateProgress)
    .then((result) => {
      const currentJob = readStoredJob();
      if (currentJob.id !== job.id) return;
      writeStoredJob({
        ...currentJob,
        status: result.ok ? "succeeded" : "failed",
        phase: "finalizing",
        completed: currentJob.total,
        completedAt: new Date().toISOString(),
        error: result.ok ? null : result.stderr || "Dependency report generation failed.",
      });
    })
    .catch((error) => {
      const currentJob = readStoredJob();
      if (currentJob.id !== job.id) return;
      writeStoredJob({
        ...currentJob,
        status: "failed",
        completedAt: new Date().toISOString(),
        error: error instanceof Error ? error.message : "Dependency report generation failed.",
      });
    })
    .finally(() => {
      if (activeJobId === job.id) activeJobId = null;
    });

  return job;
}
