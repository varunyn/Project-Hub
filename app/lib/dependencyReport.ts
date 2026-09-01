import "server-only";

import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import {
  type DependencyReportSource,
  filterDependencyReportByProject,
  mergeDependencyReportSources,
} from "./dependencyReportSelection";
import type {
  DependencyProject,
  DependencyReleaseInfo,
  DependencyReportEnrichmentMetrics,
  DependencyUpdate,
  DependencyUpdatesReport,
} from "./dependencyReportTypes";

export type {
  DependencyProject,
  DependencyReleaseInfo,
  DependencyUpdate,
  DependencyUpdatesReport,
} from "./dependencyReportTypes";

const DEFAULT_REPORT_OUTPUT_DIR = path.join(process.cwd(), "outputs");

export const DEPENDENCY_REPORT_COMMAND =
  process.env.DEPENDENCY_REPORT_COMMAND ??
  'python3 tools/dependency-reporter/dependency_reporter.py --config "<generated from projects.json>"';

const REPORT_FILE_RE = /^dependency-report-\d{4}-\d{2}-\d{2}\.json$/;
const MAX_RELEASE_NOTES_EXCERPT = 900;

interface RawReport {
  generated_at?: unknown;
  scan_roots?: unknown;
  projects?: unknown;
  enrichment?: unknown;
}

interface RawProject {
  path?: unknown;
  ecosystems?: unknown;
  manifests?: unknown;
  updates?: unknown;
  warnings?: unknown;
  errors?: unknown;
}

interface RawUpdate {
  ecosystem?: unknown;
  package?: unknown;
  current?: unknown;
  wanted?: unknown;
  latest?: unknown;
  dependency_type?: unknown;
  release_info?: unknown;
}

interface RawReleaseInfo {
  current_release_date?: unknown;
  latest_release_date?: unknown;
  homepage_url?: unknown;
  repository_url?: unknown;
  changelog_url?: unknown;
  release_notes_excerpt?: unknown;
  ai_priority?: unknown;
  ai_risk?: unknown;
  ai_suggested_action?: unknown;
  ai_notable_changes?: unknown;
  ai_breaking_changes?: unknown;
  ai_evidence_urls?: unknown;
  ai_summary?: unknown;
  ai_warning?: unknown;
}

const EMPTY_ENRICHMENT_METRICS: DependencyReportEnrichmentMetrics = {
  uniqueCandidates: null,
  cacheHits: null,
  requests: null,
  failures: null,
  skipped: null,
  promptTokens: null,
  completionTokens: null,
  reasoningTokens: null,
  totalTokens: null,
  requestDurationSeconds: null,
  aiDurationSeconds: null,
  releaseLookupSeconds: null,
  durationSeconds: null,
  model: null,
};

export function reportOutputDir(): string {
  return process.env.DEPENDENCY_REPORT_OUTPUT_DIR ?? DEFAULT_REPORT_OUTPUT_DIR;
}

export function scopedReportOutputDir(projectPath: string): string {
  const projectHash = createHash("sha256").update(projectPath).digest("hex").slice(0, 16);
  return path.join(reportOutputDir(), "projects", projectHash);
}

function canRunReporter(): boolean {
  return process.env.DEPENDENCY_REPORT_RUN_ENABLED === "true";
}

function reportRunMode(): DependencyUpdatesReport["runMode"] {
  return canRunReporter() ? "server" : "host";
}

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function normalizeReportPath(value: string): string {
  const hostRoot = process.env.HOST_PROJECTS_ROOT;
  const containerRoot = process.env.CONTAINER_PROJECTS_ROOT;
  if (!(hostRoot && containerRoot && value)) return value;

  const normalizedValue = stripTrailingSlash(value);
  const normalizedContainerRoot = stripTrailingSlash(containerRoot);
  if (
    normalizedValue === normalizedContainerRoot ||
    normalizedValue.startsWith(`${normalizedContainerRoot}/`)
  ) {
    const relativePath = normalizedValue.slice(normalizedContainerRoot.length).replace(/^\/+/, "");
    return path.join(hostRoot, relativePath);
  }

  return value;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asNullableString(value: unknown): string | null {
  const result = asString(value);
  return result.length > 0 ? result : null;
}

function truncate(value: string | null, maxLength: number): string | null {
  if (!value || value.length <= maxLength) return value;
  const clipped = value.slice(0, maxLength).trimEnd();
  return `${clipped}...`;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(asString).filter(Boolean);
}

function normalizeUrl(value: unknown): string | null {
  const raw = asNullableString(value);
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function normalizeReleaseInfo(value: unknown): DependencyReleaseInfo {
  const info = asRecord(value) as RawReleaseInfo;
  return {
    currentReleaseDate: asNullableString(info.current_release_date),
    latestReleaseDate: asNullableString(info.latest_release_date),
    homepageUrl: normalizeUrl(info.homepage_url),
    repositoryUrl: normalizeUrl(info.repository_url),
    changelogUrl: normalizeUrl(info.changelog_url),
    releaseNotesExcerpt: truncate(
      asNullableString(info.release_notes_excerpt),
      MAX_RELEASE_NOTES_EXCERPT
    ),
    aiPriority: asNullableString(info.ai_priority),
    aiRisk: asNullableString(info.ai_risk),
    aiSuggestedAction: asNullableString(info.ai_suggested_action),
    aiNotableChanges: asStringArray(info.ai_notable_changes),
    aiBreakingChanges: asStringArray(info.ai_breaking_changes),
    aiEvidenceUrls: asStringArray(info.ai_evidence_urls).filter((url) => normalizeUrl(url)),
    aiSummary: asNullableString(info.ai_summary),
    aiWarning: asNullableString(info.ai_warning),
  };
}

function nullableNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizeEnrichmentMetrics(value: unknown): DependencyReportEnrichmentMetrics {
  const raw = asRecord(value);
  return {
    uniqueCandidates: nullableNumber(raw.unique_candidates),
    cacheHits: nullableNumber(raw.cache_hits),
    requests: nullableNumber(raw.requests),
    failures: nullableNumber(raw.failures),
    skipped: nullableNumber(raw.skipped),
    promptTokens: nullableNumber(raw.prompt_tokens),
    completionTokens: nullableNumber(raw.completion_tokens),
    reasoningTokens: nullableNumber(raw.reasoning_tokens),
    totalTokens: nullableNumber(raw.total_tokens),
    requestDurationSeconds: nullableNumber(raw.request_duration_seconds),
    aiDurationSeconds: nullableNumber(raw.ai_duration_seconds),
    releaseLookupSeconds: nullableNumber(raw.release_lookup_seconds),
    durationSeconds: nullableNumber(raw.duration_seconds),
    model: asNullableString(raw.model),
  };
}

function normalizeEnrichmentState(value: unknown): DependencyUpdatesReport["enrichmentState"] {
  const state = asString(value);
  return ["disabled", "pending", "in_progress", "completed", "partial", "skipped"].includes(state)
    ? (state as Exclude<DependencyUpdatesReport["enrichmentState"], null>)
    : null;
}

function normalizeUpdate(update: unknown, projectPath: string): DependencyUpdate | null {
  const raw = asRecord(update) as RawUpdate;
  const packageName = asString(raw.package);
  const ecosystem = asString(raw.ecosystem);
  if (!(packageName && ecosystem)) return null;

  const currentVersion = asString(raw.current);
  const latestVersion = asString(raw.latest);
  const dependencyType = asString(raw.dependency_type);

  return {
    id: `${projectPath}:${ecosystem}:${packageName}`,
    ecosystem,
    packageName,
    currentVersion,
    wantedVersion: asString(raw.wanted),
    latestVersion,
    dependencyType,
    releaseInfo: normalizeReleaseInfo(raw.release_info),
  };
}

function normalizeWarnings(warnings: unknown): string[] {
  return asStringArray(warnings);
}

function normalizeProject(project: unknown): DependencyProject {
  const raw = asRecord(project) as RawProject;
  const projectPath = normalizeReportPath(asString(raw.path));
  const updates = Array.isArray(raw.updates)
    ? raw.updates
        .map((update) => normalizeUpdate(update, projectPath))
        .filter((update): update is DependencyUpdate => Boolean(update))
        .sort((a, b) => a.packageName.localeCompare(b.packageName))
    : [];

  return {
    path: projectPath,
    ecosystems: asStringArray(raw.ecosystems),
    manifests: asStringArray(raw.manifests),
    warnings: normalizeWarnings(raw.warnings),
    errors: asStringArray(raw.errors),
    updates,
  };
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

async function latestReportFileName(outputDir: string): Promise<string | null> {
  const entries = await fs.readdir(outputDir, { withFileTypes: true });
  return (
    entries
      .filter((entry) => entry.isFile() && REPORT_FILE_RE.test(entry.name))
      .map((entry) => entry.name)
      .sort((a, b) => b.localeCompare(a))[0] ?? null
  );
}

export async function readLatestDependencyReport(
  outputDir = reportOutputDir()
): Promise<DependencyUpdatesReport> {
  let reportFileName: string | null = null;
  try {
    reportFileName = await latestReportFileName(outputDir);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }

  if (!reportFileName) {
    return {
      status: "missing",
      generatedAt: null,
      scanRoots: [],
      reportFileName: null,
      command: DEPENDENCY_REPORT_COMMAND,
      canRunReporter: canRunReporter(),
      runMode: reportRunMode(),
      enrichmentState: null,
      enrichmentMetrics: { ...EMPTY_ENRICHMENT_METRICS },
      projects: [],
      totals: { projects: 0, updates: 0, warnings: 0, errors: 0 },
    };
  }

  const reportPath = path.join(/* turbopackIgnore: true */ outputDir, reportFileName);
  const rawJson = await fs.readFile(/* turbopackIgnore: true */ reportPath, "utf8");
  const rawReport = JSON.parse(rawJson) as RawReport;
  const projects = Array.isArray(rawReport.projects)
    ? rawReport.projects.map(normalizeProject).sort((a, b) => a.path.localeCompare(b.path))
    : [];

  return {
    status: "ready",
    generatedAt: asNullableString(rawReport.generated_at),
    scanRoots: asStringArray(rawReport.scan_roots).map(normalizeReportPath),
    reportFileName,
    command: DEPENDENCY_REPORT_COMMAND,
    canRunReporter: canRunReporter(),
    runMode: reportRunMode(),
    enrichmentState: normalizeEnrichmentState(asRecord(rawReport.enrichment).state),
    enrichmentMetrics: normalizeEnrichmentMetrics(asRecord(rawReport.enrichment).metrics),
    projects,
    totals: calculateTotals(projects),
  };
}

async function readLatestDependencyReportSource(
  outputDir: string
): Promise<DependencyReportSource | null> {
  const report = await readLatestDependencyReport(outputDir);
  if (!(report.status === "ready" && report.reportFileName)) return null;

  const reportPath = path.join(/* turbopackIgnore: true */ outputDir, report.reportFileName);
  const stats = await fs.stat(/* turbopackIgnore: true */ reportPath);
  return { modifiedAt: stats.mtimeMs, report };
}

async function scopedReportDirectories(): Promise<string[]> {
  const projectsDir = path.join(reportOutputDir(), "projects");
  try {
    const entries = await fs.readdir(projectsDir, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(projectsDir, entry.name));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

export async function readConsolidatedDependencyReport(): Promise<DependencyUpdatesReport> {
  const scopedDirectories = await scopedReportDirectories();
  const sources = await Promise.all(
    [reportOutputDir(), ...scopedDirectories].map(readLatestDependencyReportSource)
  );
  const merged = mergeDependencyReportSources(
    sources.filter((source): source is DependencyReportSource => source !== null)
  );
  return merged ?? readLatestDependencyReport();
}

export async function readDependencyReportForProject(
  projectPath: string
): Promise<DependencyUpdatesReport> {
  const normalizedProjectPath = normalizeReportPath(projectPath);
  const scopedReport = await readLatestDependencyReport(scopedReportOutputDir(projectPath));
  if (scopedReport.status === "ready") {
    return filterDependencyReportByProject(scopedReport, normalizedProjectPath);
  }

  const globalReport = await readLatestDependencyReport();
  return filterDependencyReportByProject(globalReport, normalizedProjectPath);
}
