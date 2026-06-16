import "server-only";

import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { getProjects, resolveProjectPathForServer } from "../utils/projectUtils";
import { reportOutputDir } from "./dependencyReport";

const execFileAsync = promisify(execFile);

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
}

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
  return values.map((value) => `  - ${value}`).join("\n");
}

function buildReporterConfig(scanRoots: string[]): string {
  const releaseIntelligenceEnabled = boolEnv(
    "DEPENDENCY_REPORT_RELEASE_INTELLIGENCE_ENABLED",
    true
  );
  const aiEnabled = boolEnv("DEPENDENCY_REPORT_AI_ENABLED", false);
  const maxPackages = numberEnv("DEPENDENCY_REPORT_RELEASE_MAX_PACKAGES", 25);
  const aiBaseUrl = process.env.DEPENDENCY_REPORT_AI_BASE_URL || "http://localhost:3001/v1";
  const aiModel = process.env.DEPENDENCY_REPORT_AI_MODEL || "meta.llama-4-scout-17b-16e-instruct";
  const aiKeyEnv = process.env.DEPENDENCY_REPORT_AI_KEY_ENV || "";

  return [
    "scan_roots:",
    yamlList(scanRoots),
    `output_dir: ${reportOutputDir()}`,
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
    ]),
    "release_intelligence:",
    `  enabled: ${releaseIntelligenceEnabled}`,
    `  max_packages: ${maxPackages}`,
    "ai:",
    `  enabled: ${aiEnabled}`,
    `  base_url: ${aiBaseUrl}`,
    `  model: ${aiModel}`,
    `  api_key_env: ${aiKeyEnv}`,
    "",
  ].join("\n");
}

async function writeTemporaryConfig(scanRoots: string[]): Promise<string> {
  const configPath = path.join(os.tmpdir(), `dependency-reporter-${Date.now()}.yaml`);
  await fs.writeFile(configPath, buildReporterConfig(scanRoots), "utf8");
  return configPath;
}

function commandLabel(configPath: string): string {
  return `${reporterPython()} "${reporterScript()}" --config "${configPath}"`;
}

function outputSnippet(value: string): string {
  return value.trim().slice(0, 4000);
}

export async function runDependencyReporter(): Promise<DependencyReportRunResult> {
  if (!isRunEnabled()) {
    throw new Error(
      "Dependency report generation is disabled. Set DEPENDENCY_REPORT_RUN_ENABLED=true."
    );
  }

  const projects = getProjects();
  const scanRoots = Array.from(
    new Set(projects.map((project) => resolveProjectPathForServer(project.path)).filter(Boolean))
  );
  if (scanRoots.length === 0) {
    throw new Error("No project paths are available for dependency report generation.");
  }

  const scriptPath = reporterScript();
  await fs.access(scriptPath);
  await fs.mkdir(reportOutputDir(), { recursive: true });
  const configPath = await writeTemporaryConfig(scanRoots);

  try {
    const result = await execFileAsync(reporterPython(), [scriptPath, "--config", configPath], {
      cwd: path.dirname(scriptPath),
      timeout: reportTimeoutMs(),
      maxBuffer: 1024 * 1024 * 8,
    });
    return {
      ok: true,
      stdout: outputSnippet(result.stdout),
      stderr: outputSnippet(result.stderr),
      command: commandLabel(configPath),
    };
  } catch (error) {
    const details = error as Error & { stdout?: string; stderr?: string };
    return {
      ok: false,
      stdout: outputSnippet(details.stdout ?? ""),
      stderr: outputSnippet(details.stderr || details.message),
      command: commandLabel(configPath),
    };
  } finally {
    await fs.unlink(configPath).catch(() => undefined);
  }
}
