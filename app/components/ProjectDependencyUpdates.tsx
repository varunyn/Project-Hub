"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useDependencyUpdates } from "../hooks/useDependencyUpdates";
import type {
  DependencyProject,
  DependencyUpdate,
  DependencyUpdatesReport,
} from "../lib/dependencyReport";

type UpdateType = "Major" | "Minor" | "Patch" | "Unknown";
type RiskLevel = "High" | "Medium" | "Low" | "Unknown";

interface RankedUpdate {
  projectPath: string;
  risk: RiskLevel;
  type: UpdateType;
  update: DependencyUpdate;
}

const PREVIEW_LIMIT = 5;

function normalizePath(value: string): string {
  return value.replace(/\/+$/, "");
}

function pathMatchesProject(reportProjectPath: string, projectPath: string): boolean {
  const reportPath = normalizePath(reportProjectPath);
  const rootPath = normalizePath(projectPath);
  return reportPath === rootPath || reportPath.startsWith(`${rootPath}/`);
}

function labelFor(value: string | null | undefined): string {
  return value && value.length > 0 ? value : "Not provided";
}

function parseVersion(value: string): [number, number, number] | null {
  const match = /(\d+)(?:\.(\d+))?(?:\.(\d+))?/.exec(value);
  if (!match) return null;
  return [Number(match[1]), Number(match[2] ?? 0), Number(match[3] ?? 0)];
}

function classifyUpdateType(update: DependencyUpdate): UpdateType {
  const current = parseVersion(update.currentVersion);
  const latest = parseVersion(update.latestVersion);
  if (!(current && latest)) return "Unknown";
  if (latest[0] > current[0]) return "Major";
  if (latest[1] > current[1]) return "Minor";
  if (latest[2] > current[2]) return "Patch";
  return "Unknown";
}

function normalizeRisk(update: DependencyUpdate, type: UpdateType): RiskLevel {
  const value = (update.releaseInfo.aiRisk ?? update.releaseInfo.aiPriority ?? "").toLowerCase();
  if (
    value.includes("critical") ||
    value.includes("high") ||
    update.releaseInfo.aiBreakingChanges.length > 0
  ) {
    return "High";
  }
  if (value.includes("medium") || value.includes("moderate")) return "Medium";
  if (value.includes("low")) return "Low";
  if (type === "Major") return "Medium";
  if (type === "Minor" || type === "Patch") return "Low";
  return "Unknown";
}

function formatDate(value: string | null): string {
  if (!value) return "Not provided";
  const dateOnlyMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const date = dateOnlyMatch
    ? new Date(Number(dateOnlyMatch[1]), Number(dateOnlyMatch[2]) - 1, Number(dateOnlyMatch[3]))
    : new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

function formatLastChecked(value: string | null): string {
  if (!value) return "Last checked not available";
  const generatedAt = new Date(value);
  if (Number.isNaN(generatedAt.getTime())) return `Last checked ${value}`;

  const diffMs = Date.now() - generatedAt.getTime();
  if (diffMs < 60_000) return "Last checked just now";

  const minutes = Math.round(diffMs / 60_000);
  if (minutes < 60) return `Last checked ${minutes} minute${minutes === 1 ? "" : "s"} ago`;

  const hours = Math.round(minutes / 60);
  if (hours < 48) return `Last checked ${hours} hour${hours === 1 ? "" : "s"} ago`;

  const days = Math.round(hours / 24);
  return `Last checked ${days} day${days === 1 ? "" : "s"} ago`;
}

function updateTypeTone(type: UpdateType): string {
  if (type === "Major") return "border-red-200 bg-red-50 text-red-700";
  if (type === "Minor") return "border-amber-200 bg-amber-50 text-amber-700";
  if (type === "Patch") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  return "border-slate-200 bg-slate-50 text-slate-600";
}

function riskTone(risk: RiskLevel): string {
  if (risk === "High") return "border-red-200 bg-red-50 text-red-700";
  if (risk === "Medium") return "border-amber-200 bg-amber-50 text-amber-700";
  if (risk === "Low") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  return "border-slate-200 bg-slate-50 text-slate-600";
}

function rankUpdate(item: RankedUpdate): number {
  const riskScore: Record<RiskLevel, number> = {
    High: 0,
    Medium: 1,
    Low: 2,
    Unknown: 3,
  };
  const typeScore: Record<UpdateType, number> = {
    Major: 0,
    Minor: 1,
    Patch: 2,
    Unknown: 3,
  };
  return riskScore[item.risk] * 10 + typeScore[item.type];
}

function createRankedUpdates(projects: DependencyProject[]): RankedUpdate[] {
  return projects
    .flatMap((project) =>
      project.updates.map((update) => {
        const type = classifyUpdateType(update);
        return {
          projectPath: project.path,
          risk: normalizeRisk(update, type),
          type,
          update,
        };
      })
    )
    .sort((a, b) => {
      const rank = rankUpdate(a) - rankUpdate(b);
      if (rank !== 0) return rank;
      return a.update.packageName.localeCompare(b.update.packageName);
    });
}

function countByValue<T extends string>(
  items: RankedUpdate[],
  getValue: (item: RankedUpdate) => T
) {
  return items.reduce<Record<T, number>>(
    (counts, item) => {
      const value = getValue(item);
      counts[value] = (counts[value] ?? 0) + 1;
      return counts;
    },
    {} as Record<T, number>
  );
}

function ProjectDependencyEmpty({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-dashed border-[oklch(86%_0.04_255)] bg-[oklch(98%_0.012_245)] px-4 py-5 text-sm font-medium text-[oklch(48%_0.06_260)]">
      {message}
    </div>
  );
}

function SummaryChip({
  className,
  label,
  value,
}: {
  className: string;
  label: string;
  value: number;
}) {
  return (
    <span
      className={`inline-flex min-h-7 items-center rounded-full border px-2.5 text-xs font-semibold ${className}`}
    >
      {value} {label}
    </span>
  );
}

function UpdateStatusBadge({ label, tone }: { label: string; tone: string }) {
  return (
    <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${tone}`}>
      {label}
    </span>
  );
}

function DependencyPreviewTable({ updates }: { updates: RankedUpdate[] }) {
  if (updates.length === 0) return null;

  return (
    <div className="overflow-hidden rounded-lg border border-[oklch(88%_0.035_255)] bg-[oklch(99%_0.006_245)]">
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-[oklch(97%_0.018_245)] text-xs font-semibold uppercase tracking-wide text-[oklch(49%_0.06_260)]">
            <tr>
              <th className="px-3 py-2.5">Package</th>
              <th className="px-3 py-2.5">Current</th>
              <th className="px-3 py-2.5">Latest</th>
              <th className="px-3 py-2.5">Type</th>
              <th className="px-3 py-2.5">Risk</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[oklch(91%_0.025_255)]">
            {updates.map((item) => (
              <tr key={item.update.id} className="align-middle">
                <td className="max-w-[13rem] px-3 py-2.5">
                  <div className="truncate font-semibold text-[oklch(26%_0.065_260)]">
                    {item.update.packageName}
                  </div>
                  <div className="mt-0.5 truncate text-xs font-medium text-[oklch(55%_0.055_260)]">
                    {item.update.ecosystem}
                  </div>
                </td>
                <td className="px-3 py-2.5 font-mono text-xs font-semibold text-[oklch(45%_0.055_260)]">
                  {labelFor(item.update.currentVersion)}
                </td>
                <td className="px-3 py-2.5 font-mono text-xs font-semibold text-[oklch(25%_0.065_260)]">
                  {labelFor(item.update.latestVersion)}
                </td>
                <td className="px-3 py-2.5">
                  <UpdateStatusBadge label={item.type} tone={updateTypeTone(item.type)} />
                </td>
                <td className="px-3 py-2.5">
                  <UpdateStatusBadge label={item.risk} tone={riskTone(item.risk)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Messages({
  report,
  runError,
  runMessage,
}: {
  report: DependencyUpdatesReport | null;
  runError: string | null;
  runMessage: string | null;
}) {
  return (
    <>
      {runMessage && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-medium text-blue-800">
          {runMessage}
        </div>
      )}

      {runError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
          {runError}
        </div>
      )}

      {report?.runMode === "host" && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-medium text-blue-900">
          Run the reporter on the host Mac, then refresh this panel.
        </div>
      )}
    </>
  );
}

function DependencyDrawer({
  generatedAt,
  onClose,
  open,
  updates,
}: {
  generatedAt: string | null;
  onClose: () => void;
  open: boolean;
  updates: RankedUpdate[];
}) {
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose, open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true">
      <button
        aria-label="Close dependency updates"
        className="absolute inset-0 cursor-default bg-[oklch(18%_0.02_255_/_0.32)]"
        onClick={onClose}
        type="button"
      />
      <aside className="absolute right-0 top-0 flex h-full w-full max-w-2xl flex-col border-l border-[oklch(86%_0.035_255)] bg-[oklch(99%_0.006_245)] shadow-2xl">
        <div className="border-b border-[oklch(89%_0.03_255)] px-5 py-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-[oklch(50%_0.08_255)]">
                Dependency updates
              </p>
              <h3 className="mt-1 text-lg font-semibold tracking-tight text-[oklch(24%_0.07_260)]">
                Full update list
              </h3>
              <p className="mt-1 text-sm font-medium text-[oklch(50%_0.06_260)]">
                {updates.length} package{updates.length === 1 ? "" : "s"} from{" "}
                {formatLastChecked(generatedAt).toLowerCase()}.
              </p>
            </div>
            <button
              aria-label="Close dependency drawer"
              className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg text-[oklch(42%_0.06_260)] transition-colors hover:bg-[oklch(96%_0.025_245)] focus:outline-none focus:ring-2 focus:ring-[oklch(74%_0.12_230)]"
              onClick={onClose}
              type="button"
            >
              ×
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <div className="divide-y divide-[oklch(91%_0.025_255)] rounded-lg border border-[oklch(88%_0.035_255)] bg-[oklch(99%_0.006_245)]">
            {updates.map((item) => {
              const release = item.update.releaseInfo;
              return (
                <article className="px-4 py-3" key={item.update.id}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h4 className="truncate text-sm font-semibold text-[oklch(25%_0.07_260)]">
                          {item.update.packageName}
                        </h4>
                        <UpdateStatusBadge label={item.type} tone={updateTypeTone(item.type)} />
                        <UpdateStatusBadge label={item.risk} tone={riskTone(item.risk)} />
                      </div>
                      <p className="mt-1 truncate font-mono text-xs font-semibold text-[oklch(50%_0.055_260)]">
                        {labelFor(item.update.currentVersion)} →{" "}
                        {labelFor(item.update.latestVersion)}
                      </p>
                      <p className="mt-1 truncate text-xs font-medium text-[oklch(58%_0.045_260)]">
                        {item.projectPath}
                      </p>
                    </div>
                    <div className="text-right text-xs font-semibold text-[oklch(50%_0.06_260)]">
                      <p>{item.update.dependencyType || "Dependency"}</p>
                      <p className="mt-1">{formatDate(release.latestReleaseDate)}</p>
                    </div>
                  </div>
                  {(release.aiSuggestedAction || release.aiSummary) && (
                    <p className="mt-2 text-sm leading-6 text-slate-700">
                      {release.aiSuggestedAction ?? release.aiSummary}
                    </p>
                  )}
                </article>
              );
            })}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[oklch(89%_0.03_255)] px-5 py-4">
          <p className="text-xs font-semibold text-[oklch(52%_0.055_260)]">
            Opens in place so the quest context stays visible.
          </p>
          <Link
            className="inline-flex min-h-9 items-center justify-center rounded-lg border border-[oklch(88%_0.035_255)] bg-[oklch(99%_0.006_245)] px-3 py-1.5 text-sm font-bold text-[oklch(34%_0.07_255)] shadow-sm transition-colors hover:bg-[oklch(97%_0.025_245)] focus:outline-none focus:ring-2 focus:ring-[oklch(78%_0.1_230)] focus:ring-offset-2"
            href="/dependencies"
          >
            Open full report
          </Link>
        </div>
      </aside>
    </div>
  );
}

function ProjectDependencyContent({
  error,
  issueCount,
  loading,
  matchingProjects,
  onViewAll,
  rankedUpdates,
  report,
  updateCount,
}: {
  error: string | null;
  issueCount: number;
  loading: boolean;
  matchingProjects: DependencyProject[];
  onViewAll: () => void;
  rankedUpdates: RankedUpdate[];
  report: DependencyUpdatesReport | null;
  updateCount: number;
}) {
  if (loading) {
    return (
      <div className="space-y-3">
        <div className="h-16 animate-pulse rounded-lg bg-[oklch(95%_0.035_245)]" />
        <div className="h-40 animate-pulse rounded-lg bg-[oklch(96%_0.03_245)]" />
      </div>
    );
  }

  if (error) return <ProjectDependencyEmpty message={error} />;

  if (report?.status === "missing") {
    return (
      <ProjectDependencyEmpty message="No dependency report JSON found. Generate the report, then refresh this page." />
    );
  }

  if (matchingProjects.length === 0) {
    return (
      <ProjectDependencyEmpty message="No dependency report entry matched this quest path in the latest report." />
    );
  }

  if (updateCount === 0) {
    return (
      <ProjectDependencyEmpty
        message={
          issueCount > 0
            ? "No outdated direct dependencies were reported for this quest path, but the scanner recorded warnings or errors."
            : "No outdated direct dependencies found for this quest path in the latest report."
        }
      />
    );
  }

  const previewUpdates = rankedUpdates.slice(0, PREVIEW_LIMIT);
  const hiddenCount = Math.max(updateCount - previewUpdates.length, 0);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-[oklch(28%_0.065_260)]">Priority updates</h3>
        <button
          className="inline-flex min-h-8 items-center rounded-lg px-2 text-sm font-semibold text-[oklch(38%_0.13_240)] transition-colors hover:bg-[oklch(95%_0.045_230)] focus:outline-none focus:ring-2 focus:ring-[oklch(74%_0.12_230)]"
          onClick={onViewAll}
          type="button"
        >
          View all →
        </button>
      </div>

      <DependencyPreviewTable updates={previewUpdates} />

      {hiddenCount > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-[oklch(97%_0.018_245)] px-3 py-2">
          <p className="text-sm font-semibold text-[oklch(46%_0.06_260)]">
            +{hiddenCount} more outdated package{hiddenCount === 1 ? "" : "s"}
          </p>
          <button
            className="inline-flex min-h-8 items-center rounded-lg px-2 text-sm font-semibold text-[oklch(38%_0.13_240)] transition-colors hover:bg-[oklch(94%_0.045_230)] focus:outline-none focus:ring-2 focus:ring-[oklch(74%_0.12_230)]"
            onClick={onViewAll}
            type="button"
          >
            View all updates →
          </button>
        </div>
      )}
    </div>
  );
}

export default function ProjectDependencyUpdates({ projectPath }: { projectPath: string }) {
  const { report, loading, error, refetch, runReport } = useDependencyUpdates();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [runningReport, setRunningReport] = useState(false);
  const [runMessage, setRunMessage] = useState<string | null>(null);
  const [runError, setRunError] = useState<string | null>(null);

  const matchingProjects = useMemo(() => {
    if (!(report && projectPath)) return [];
    return report.projects
      .filter((project) => pathMatchesProject(project.path, projectPath))
      .map((project) => ({
        ...project,
        updates: [...project.updates].sort((a, b) => a.packageName.localeCompare(b.packageName)),
      }));
  }, [projectPath, report]);

  const rankedUpdates = useMemo(() => createRankedUpdates(matchingProjects), [matchingProjects]);
  const typeCounts = useMemo(
    () => ({
      Major: 0,
      Minor: 0,
      Patch: 0,
      Unknown: 0,
      ...countByValue(rankedUpdates, (item) => item.type),
    }),
    [rankedUpdates]
  );
  const riskCounts = useMemo(
    () => ({
      High: 0,
      Medium: 0,
      Low: 0,
      Unknown: 0,
      ...countByValue(rankedUpdates, (item) => item.risk),
    }),
    [rankedUpdates]
  );

  const updateCount = rankedUpdates.length;
  const issueCount = matchingProjects.reduce(
    (total, project) => total + project.warnings.length + project.errors.length,
    0
  );

  const handleRunReport = async () => {
    setRunningReport(true);
    setRunMessage(null);
    setRunError(null);
    try {
      const response = await runReport(projectPath);
      setRunMessage(
        response.result.ok
          ? "Dependency report generated."
          : response.result.stderr || "Report failed."
      );
    } catch (runErrorValue) {
      setRunError(
        runErrorValue instanceof Error ? runErrorValue.message : "Failed to run dependency report."
      );
    } finally {
      setRunningReport(false);
    }
  };

  return (
    <>
      <section className="rounded-lg border border-[oklch(88%_0.03_255)] bg-[oklch(99%_0.006_245)] p-4 shadow-[0_1px_2px_oklch(25%_0.04_260_/_0.08)] ring-1 ring-[oklch(96%_0.025_255)]">
        <div className="space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-[oklch(50%_0.08_255)]">
                Dependency health
              </p>
              <h2 className="mt-1 text-base font-semibold tracking-tight text-[oklch(25%_0.07_260)]">
                {updateCount} outdated dependenc{updateCount === 1 ? "y" : "ies"}
              </h2>
              <p className="mt-1 text-sm font-medium text-[oklch(49%_0.06_260)]">
                {formatLastChecked(report?.generatedAt ?? null)}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {report?.canRunReporter ? (
                <button
                  className="inline-flex min-h-9 items-center justify-center rounded-lg bg-[oklch(28%_0.08_265)] px-3 py-1.5 text-sm font-semibold text-[oklch(98%_0.006_250)] shadow-sm transition-colors hover:bg-[oklch(34%_0.1_265)] focus:outline-none focus:ring-2 focus:ring-[oklch(72%_0.14_250)] focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={runningReport}
                  onClick={handleRunReport}
                  type="button"
                >
                  {runningReport ? "Running" : "Run report"}
                </button>
              ) : (
                <button
                  className="inline-flex min-h-9 items-center justify-center rounded-lg bg-[oklch(28%_0.08_265)] px-3 py-1.5 text-sm font-semibold text-[oklch(98%_0.006_250)] shadow-sm transition-colors hover:bg-[oklch(34%_0.1_265)] focus:outline-none focus:ring-2 focus:ring-[oklch(72%_0.14_250)] focus:ring-offset-2"
                  onClick={() => refetch()}
                  type="button"
                >
                  Refresh report
                </button>
              )}
              <button
                className="inline-flex min-h-9 items-center justify-center rounded-lg border border-[oklch(88%_0.035_255)] bg-[oklch(99%_0.006_245)] px-3 py-1.5 text-sm font-semibold text-[oklch(34%_0.07_255)] shadow-sm transition-colors hover:bg-[oklch(97%_0.025_245)] focus:outline-none focus:ring-2 focus:ring-[oklch(78%_0.1_230)] focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={updateCount === 0}
                onClick={() => setDrawerOpen(true)}
                type="button"
              >
                View all →
              </button>
            </div>
          </div>

          {updateCount > 0 && (
            <div className="space-y-2">
              <div className="flex flex-wrap gap-2">
                <SummaryChip
                  className={updateTypeTone("Major")}
                  label="Major"
                  value={typeCounts.Major}
                />
                <SummaryChip
                  className={updateTypeTone("Minor")}
                  label="Minor"
                  value={typeCounts.Minor}
                />
                <SummaryChip
                  className={updateTypeTone("Patch")}
                  label="Patch"
                  value={typeCounts.Patch}
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <SummaryChip
                  className={riskTone("High")}
                  label="High Risk"
                  value={riskCounts.High}
                />
                <SummaryChip
                  className={riskTone("Medium")}
                  label="Medium Risk"
                  value={riskCounts.Medium}
                />
                <SummaryChip className={riskTone("Low")} label="Low Risk" value={riskCounts.Low} />
              </div>
            </div>
          )}

          <Messages report={report} runError={runError} runMessage={runMessage} />

          <ProjectDependencyContent
            error={error}
            issueCount={issueCount}
            loading={loading}
            matchingProjects={matchingProjects}
            onViewAll={() => setDrawerOpen(true)}
            rankedUpdates={rankedUpdates}
            report={report}
            updateCount={updateCount}
          />
        </div>
      </section>

      <DependencyDrawer
        generatedAt={report?.generatedAt ?? null}
        onClose={() => setDrawerOpen(false)}
        open={drawerOpen}
        updates={rankedUpdates}
      />
    </>
  );
}
