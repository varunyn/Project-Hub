import "server-only";

import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { getProjects, resolveProjectPathForServer } from "../utils/projectUtils";
import { reportOutputDir, scopedReportOutputDir } from "./dependencyReport";

const DEFAULT_REPORTER_SCRIPT = path.join(
  process.cwd(),
  "tools",
  "dependency-reporter",
  "dependency_reporter.py"
);
const DEFAULT_REPORT_TIMEOUT_MS = 10 * 60 * 1000;

export interface DependencyReportRunResult {
  ok: boolean;
  stdout: string;
  stderr: string;
  command: string;
  outputDir: string;
}

export interface DependencyReportProgress {
  phase: "scanning" | "release_lookup" | "ai_enrichment" | "finalizing";
  completed: number;
  total: number;
}

export type DependencyReportProgressCallback = (progress: DependencyReportProgress) => void;

export function parseDependencyReportProgress(line: string): DependencyReportProgress | null {
  try {
    const value = JSON.parse(line) as Record<string, unknown>;
    const phases = ["scanning", "release_lookup", "ai_enrichment", "finalizing"] as const;
    const phase = value.phase as (typeof phases)[number];
    if (
      value.type !== "dependency_report_progress" ||
      typeof value.phase !== "string" ||
      !phases.includes(phase)
    )
      return null;
    if (typeof value.completed !== "number" || typeof value.total !== "number") return null;
    const completed = value.completed;
    const total = value.total;
    if (
      !(Number.isInteger(completed) && Number.isInteger(total)) ||
      completed < 0 ||
      total < 0 ||
      completed > total
    )
      return null;
    return { phase, completed, total };
  } catch {
    return null;
  }
}

// Short alias kept for callers that only need to consume a single JSONL event.
export const parseProgressLine = parseDependencyReportProgress;

function isRunEnabled(): boolean {
  return process.env.DEPENDENCY_REPORT_RUN_ENABLED === "true";
}

function reporterPython(): string {
  return process.env.DEPENDENCY_REPORT_PYTHON || "python3";
}

function reporterScript(): string {
  return process.env.DEPENDENCY_REPORT_SCRIPT || DEFAULT_REPORTER_SCRIPT;
}

function reportTimeoutMs(): number {
  const parsed = Number(process.env.DEPENDENCY_REPORT_RUN_TIMEOUT_MS);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_REPORT_TIMEOUT_MS;
}

function boolEnv(name: string, fallback: boolean): boolean {
  const value = process.env[name];
  if (value === undefined) return fallback;
  return value === "true";
}

function numberEnv(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function yamlList(values: string[]): string {
  return values.map((value) => `  - ${JSON.stringify(value)}`).join("\n");
}

function yamlString(value: string): string {
  return JSON.stringify(value);
}

export function buildReporterConfig(
  scanRoots: string[],
  outputDir: string,
  aiEnabled = boolEnv("DEPENDENCY_REPORT_AI_ENABLED", false)
): string {
  const releaseIntelligenceEnabled = boolEnv(
    "DEPENDENCY_REPORT_RELEASE_INTELLIGENCE_ENABLED",
    true
  );
  const maxPackages = numberEnv("DEPENDENCY_REPORT_RELEASE_MAX_PACKAGES", 25);
  const aiBaseUrl = process.env.DEPENDENCY_REPORT_AI_BASE_URL || "http://localhost:3001/v1";
  const aiModel = process.env.DEPENDENCY_REPORT_AI_MODEL || "meta.llama-4-scout-17b-16e-instruct";
  const aiKeyEnv = process.env.DEPENDENCY_REPORT_AI_KEY_ENV || "";

  return [
    "scan_roots:",
    yamlList(scanRoots),
    `output_dir: ${yamlString(outputDir)}`,
    "ignore_dirs:",
    yamlList([
      ".git",
      "node_modules",
      ".pnpm-store",
      ".venv",
      "venv",
      "__pycache__",
      "dist",
      "build",
      ".next",
      ".eve",
    ]),
    "release_intelligence:",
    `  enabled: ${releaseIntelligenceEnabled}`,
    `  max_packages: ${maxPackages}`,
    `  evidence_max_chars: ${numberEnv("DEPENDENCY_REPORT_EVIDENCE_MAX_CHARS", 2000)}`,
    `  cache_path: ${yamlString(process.env.DEPENDENCY_REPORT_CACHE_PATH || path.join(reportOutputDir(), "dependency-report-cache.json"))}`,
    `  cache_ttl_hours: ${numberEnv("DEPENDENCY_REPORT_CACHE_TTL_HOURS", 168)}`,
    `  cache_max_entries: ${numberEnv("DEPENDENCY_REPORT_CACHE_MAX_ENTRIES", 500)}`,
    "ai:",
    `  enabled: ${aiEnabled}`,
    `  base_url: ${yamlString(aiBaseUrl)}`,
    `  model: ${yamlString(aiModel)}`,
    `  api_key_env: ${yamlString(aiKeyEnv)}`,
    `  completion_tokens: ${numberEnv("DEPENDENCY_REPORT_AI_COMPLETION_TOKENS", 300)}`,
    `  prompt_schema: ${yamlString(process.env.DEPENDENCY_REPORT_AI_PROMPT_SCHEMA || "dependency-summary-v1")}`,
    ...(process.env.DEPENDENCY_REPORT_AI_REASONING_EFFORT
      ? [`  reasoning_effort: ${yamlString(process.env.DEPENDENCY_REPORT_AI_REASONING_EFFORT)}`]
      : []),
    "",
  ].join("\n");
}

async function writeTemporaryConfig(
  scanRoots: string[],
  outputDir: string,
  aiEnabled: boolean
): Promise<string> {
  const configPath = path.join(os.tmpdir(), `dependency-reporter-${Date.now()}.yaml`);
  await fs.writeFile(configPath, buildReporterConfig(scanRoots, outputDir, aiEnabled), "utf8");
  return configPath;
}

function commandLabel(configPath: string): string {
  return `${reporterPython()} "${reporterScript()}" --config "${configPath}"`;
}

function outputSnippet(value: string): string {
  return value.trim().slice(0, 4000);
}

export async function runDependencyReporter(
  projectPath?: string,
  aiEnabled = boolEnv("DEPENDENCY_REPORT_AI_ENABLED", false),
  onProgress?: DependencyReportProgressCallback
): Promise<DependencyReportRunResult> {
  if (!isRunEnabled()) {
    throw new Error(
      "Dependency report generation is disabled. Set DEPENDENCY_REPORT_RUN_ENABLED=true."
    );
  }

  const projects = getProjects();
  const requestedProject = projectPath
    ? projects.find((project) => project.path === projectPath)
    : undefined;
  if (projectPath && !requestedProject) {
    throw new Error("The requested project is not configured.");
  }
  const scanRoots = Array.from(
    new Set(
      (requestedProject ? [requestedProject] : projects)
        .map((project) => resolveProjectPathForServer(project.path))
        .filter(Boolean)
    )
  );
  if (scanRoots.length === 0) {
    throw new Error("No project paths are available for dependency report generation.");
  }

  const scriptPath = reporterScript();
  await fs.access(scriptPath);
  const outputDir = requestedProject
    ? scopedReportOutputDir(requestedProject.path)
    : reportOutputDir();
  await fs.mkdir(outputDir, { recursive: true });
  const configPath = await writeTemporaryConfig(scanRoots, outputDir, aiEnabled);

  try {
    const result = await runReporterProcess(configPath, onProgress);
    return { ...result, command: commandLabel(configPath), outputDir };
  } catch (error) {
    const details = error as Error & { stdout?: string; stderr?: string };
    return {
      ok: false,
      stdout: outputSnippet(details.stdout ?? ""),
      // The Python reporter prints its handled errors to stdout. Preserve that
      // output so the UI shows the actual failure instead of only execFile's
      // generic "Command failed" message.
      stderr: outputSnippet(details.stderr || details.stdout || details.message),
      command: commandLabel(configPath),
      outputDir,
    };
  } finally {
    await fs.unlink(configPath).catch(() => undefined);
  }
}

async function runReporterProcess(
  configPath: string,
  onProgress?: DependencyReportProgressCallback
): Promise<Pick<DependencyReportRunResult, "ok" | "stdout" | "stderr">> {
  return new Promise((resolve) => {
    const child = spawn(
      /* turbopackIgnore: true */
      reporterPython(),
      [reporterScript(), "--config", configPath, "--progress"],
      {
        cwd: path.dirname(reporterScript()),
      }
    );
    let stdout = "";
    let stderr = "";
    const pending = { stdout: "", stderr: "" };
    const consume = (chunk: Buffer, stream: "stdout" | "stderr") => {
      const text = chunk.toString();
      if (stream === "stdout") stdout += text;
      else stderr += text;
      pending[stream] += text;
      const lines = pending[stream].split(/\r?\n/);
      pending[stream] = lines.pop() ?? "";
      for (const line of lines) {
        const progress = parseDependencyReportProgress(line.trim());
        if (progress) onProgress?.(progress);
      }
    };
    child.stdout.on("data", (chunk: Buffer) => consume(chunk, "stdout"));
    child.stderr.on("data", (chunk: Buffer) => consume(chunk, "stderr"));
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      resolve({
        ok: false,
        stdout: outputSnippet(stdout),
        stderr: outputSnippet(stderr || stdout || "Dependency report timed out."),
      });
    }, reportTimeoutMs());
    child.on("error", (error) => {
      clearTimeout(timer);
      resolve({
        ok: false,
        stdout: outputSnippet(stdout),
        stderr: outputSnippet(stderr || stdout || error.message),
      });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({
        ok: code === 0,
        stdout: outputSnippet(stdout),
        stderr: outputSnippet(stderr || (code === 0 ? "" : stdout)),
      });
    });
  });
}
