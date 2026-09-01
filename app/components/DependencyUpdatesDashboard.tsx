"use client";

import { useMemo, useState } from "react";
import { useDependencyUpdates } from "../hooks/useDependencyUpdates";
import type {
  DependencyProject,
  DependencyUpdate,
  DependencyUpdatesReport,
} from "../lib/dependencyReport";

const ALL = "all";

type ActiveTab = "projects" | "dependencies";
type DetailTab = "notes" | "breaking" | "notable" | "evidence";

interface RowModel {
  key: string;
  kind: ActiveTab;
  name: string;
  sublabel: string;
  ecosystem: string;
  project: DependencyProject;
  update: DependencyUpdate;
  outdatedCount: number;
  breakingCount: number;
  risk: string | null;
  priority: string | null;
  updateType: string;
  releaseDate: string | null;
  lastUpdated: string | null;
}

function labelFor(value: string | null | undefined, fallback = "Not provided"): string {
  return value && value.length > 0 ? value : fallback;
}

function formatDate(value: string | null | undefined): string {
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

function compactPath(path: string): string {
  const parts = path.split("/").filter(Boolean);
  return parts.slice(-2).join("/") || path;
}

function versionCore(value: string): number[] {
  const clean = value
    .replace(/^[^\d]*/, "")
    .split(/[.-]/)
    .slice(0, 3);
  return clean.map((part) => {
    const parsed = Number.parseInt(part, 10);
    return Number.isNaN(parsed) ? 0 : parsed;
  });
}

function updateTypeFor(update: DependencyUpdate): string {
  const [currentMajor, currentMinor, currentPatch] = versionCore(update.currentVersion);
  const [latestMajor, latestMinor, latestPatch] = versionCore(update.latestVersion);

  if (latestMajor > currentMajor) return "Major";
  if (latestMinor > currentMinor) return "Minor";
  if (latestPatch > currentPatch) return "Patch";
  return "Version";
}

function riskRank(value: string | null): number {
  const normalized = (value ?? "").toLowerCase();
  if (normalized.includes("critical")) return 4;
  if (normalized.includes("high")) return 3;
  if (normalized.includes("medium") || normalized.includes("moderate")) return 2;
  if (normalized.includes("low")) return 1;
  return 0;
}

function highestRisk(updates: DependencyUpdate[]): string | null {
  return updates.reduce<string | null>((highest, update) => {
    const risk = update.releaseInfo.aiRisk;
    return riskRank(risk) > riskRank(highest) ? risk : highest;
  }, null);
}

function highestPriority(updates: DependencyUpdate[]): string | null {
  return updates.reduce<string | null>((highest, update) => {
    const priority = update.releaseInfo.aiPriority;
    return riskRank(priority) > riskRank(highest) ? priority : highest;
  }, null);
}

function topUpdateFor(project: DependencyProject): DependencyUpdate {
  return [...project.updates].sort((a, b) => {
    const riskDelta = riskRank(b.releaseInfo.aiRisk) - riskRank(a.releaseInfo.aiRisk);
    if (riskDelta !== 0) return riskDelta;
    return b.releaseInfo.aiBreakingChanges.length - a.releaseInfo.aiBreakingChanges.length;
  })[0];
}

function toneFor(value: string | null | undefined): string {
  const normalized = (value ?? "").toLowerCase();
  if (normalized.includes("critical") || normalized.includes("high")) {
    return "border-red-200 bg-red-50 text-red-700";
  }
  if (normalized.includes("medium") || normalized.includes("moderate")) {
    return "border-orange-200 bg-orange-50 text-orange-700";
  }
  if (normalized.includes("low")) return "border-emerald-200 bg-emerald-50 text-emerald-700";
  return "border-slate-200 bg-slate-50 text-slate-600";
}

function ecosystemTone(value: string): string {
  const normalized = value.toLowerCase();
  if (normalized.includes("python")) return "bg-blue-50 text-blue-700 ring-blue-200";
  if (normalized.includes("node")) return "bg-emerald-50 text-emerald-700 ring-emerald-200";
  if (normalized.includes("go")) return "bg-cyan-50 text-cyan-700 ring-cyan-200";
  return "bg-slate-100 text-slate-700 ring-slate-200";
}

function Badge({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${className}`}
    >
      {children}
    </span>
  );
}

function Icon({
  name,
  className = "size-4",
}: {
  name: "box" | "download" | "play" | "refresh" | "search" | "spark" | "x";
  className?: string;
}) {
  const paths = {
    box: (
      <>
        <path d="M12 3.75 4.5 7.5l7.5 3.75 7.5-3.75L12 3.75Z" />
        <path d="M4.5 7.5v8.25L12 19.5l7.5-3.75V7.5" />
        <path d="M12 11.25v8.25" />
      </>
    ),
    download: (
      <>
        <path d="M12 3.75v10.5" />
        <path d="m8.25 10.5 3.75 3.75 3.75-3.75" />
        <path d="M4.5 16.5v2.25A1.5 1.5 0 0 0 6 20.25h12a1.5 1.5 0 0 0 1.5-1.5V16.5" />
      </>
    ),
    play: <path d="M7.5 5.25v13.5l10.5-6.75L7.5 5.25Z" />,
    refresh: (
      <>
        <path d="M19.5 12a7.5 7.5 0 0 1-12.8 5.3L4.5 15" />
        <path d="M4.5 19.5V15H9" />
        <path d="M4.5 12A7.5 7.5 0 0 1 17.3 6.7L19.5 9" />
        <path d="M19.5 4.5V9H15" />
      </>
    ),
    search: (
      <>
        <circle cx="10.5" cy="10.5" r="5.25" />
        <path d="m14.25 14.25 4.5 4.5" />
      </>
    ),
    spark: (
      <>
        <path d="M12 3.75 13.65 9l5.1 1.5-5.1 1.5L12 17.25 10.35 12l-5.1-1.5 5.1-1.5L12 3.75Z" />
        <path d="m18 15.75.75 2.25 2.25.75-2.25.75L18 21.75l-.75-2.25L15 18.75l2.25-.75.75-2.25Z" />
      </>
    ),
    x: (
      <>
        <path d="m6 6 12 12" />
        <path d="M18 6 6 18" />
      </>
    ),
  };

  return (
    <svg
      aria-hidden
      className={className}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={1.8}
      viewBox="0 0 24 24"
    >
      {paths[name]}
    </svg>
  );
}

function ExternalLink({ href, children }: { href: string | null; children: React.ReactNode }) {
  if (!href) return null;
  return (
    <a
      className="inline-flex min-h-8 items-center rounded-md px-2 text-xs font-semibold text-blue-700 transition-colors hover:bg-blue-50 hover:text-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-300"
      href={href}
      rel="noreferrer"
      target="_blank"
    >
      {children}
    </a>
  );
}

function LoadingState() {
  return (
    <div className="space-y-4">
      <div className="h-44 animate-pulse rounded-lg border border-slate-200 bg-white shadow-sm" />
      <div className="h-28 animate-pulse rounded-lg border border-slate-200 bg-white shadow-sm" />
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_26rem]">
        <div className="h-96 animate-pulse rounded-lg border border-slate-200 bg-white shadow-sm" />
        <div className="h-96 animate-pulse rounded-lg border border-slate-200 bg-white shadow-sm" />
      </div>
    </div>
  );
}

function EmptyState({
  title,
  message,
  command,
}: {
  title: string;
  message: string;
  command?: string;
}) {
  return (
    <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center shadow-sm">
      <h2 className="text-lg font-semibold tracking-tight text-slate-950">{title}</h2>
      <p className="mx-auto mt-2 max-w-2xl text-sm leading-6 text-slate-500">{message}</p>
      {command && (
        <pre className="mx-auto mt-5 max-w-3xl overflow-x-auto rounded-lg border border-slate-200 bg-slate-950 p-4 text-left text-xs text-slate-100">
          <code>{command}</code>
        </pre>
      )}
    </div>
  );
}

function HostReportCommand({ command }: { command: string }) {
  return (
    <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900 shadow-sm">
      <p className="font-semibold">Run the dependency reporter on the host Mac, then refresh.</p>
      <pre className="mt-3 overflow-x-auto rounded-lg border border-blue-100 bg-white p-3 text-xs text-slate-900">
        <code>{command}</code>
      </pre>
    </div>
  );
}

function PageHeader({
  loading,
  running,
  report,
  onExport,
  onRunReport,
}: {
  loading: boolean;
  running: boolean;
  report: DependencyUpdatesReport | null;
  onExport: () => void;
  onRunReport: () => void;
}) {
  return (
    <header className="mb-5 flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        <div className="mb-3 flex items-center gap-2 text-xs font-semibold text-slate-500">
          <Icon className="size-3.5 text-blue-600" name="box" />
          <span>AI Tools</span>
          <span className="text-slate-300">/</span>
          <span className="text-slate-800">Dependency Updates</span>
        </div>
        <h1 className="text-3xl font-semibold tracking-tight text-slate-950">Dependency Updates</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
          View and manage outdated dependencies across all local projects.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-800 shadow-sm transition-colors hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-300 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          disabled={loading || !report}
          onClick={onExport}
          type="button"
        >
          <Icon name="download" />
          Export report
        </button>
        <button
          className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-slate-950 px-4 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={running}
          onClick={onRunReport}
          type="button"
        >
          <Icon name="play" />
          {running ? "Running report" : "Run full report"}
        </button>
      </div>
    </header>
  );
}

function OverviewSummary({
  loading,
  report,
  breakingCount,
  onRefresh,
}: {
  loading: boolean;
  report: DependencyUpdatesReport | null;
  breakingCount: number;
  onRefresh: () => void;
}) {
  const generatedLabel = report?.generatedAt
    ? `Generated ${formatDate(report.generatedAt)} from ${report.reportFileName}`
    : "Latest reporter output";

  const metrics = [
    {
      label: "Projects",
      value: report?.totals.projects ?? 0,
      note: "All ecosystems",
      tone: "text-slate-500",
    },
    {
      label: "Outdated dependencies",
      value: report?.totals.updates ?? 0,
      note: report && report.totals.updates > 0 ? "Needs review" : "Current",
      tone: report && report.totals.updates > 0 ? "text-orange-700" : "text-emerald-700",
    },
    {
      label: "Breaking changes",
      value: breakingCount,
      note: breakingCount > 0 ? "High risk" : "None detected",
      tone: breakingCount > 0 ? "text-red-700" : "text-emerald-700",
    },
    {
      label: "Security vulnerabilities",
      value: 0,
      note: "No issues",
      tone: "text-emerald-700",
    },
    {
      label: "Warnings",
      value: report?.totals.warnings ?? 0,
      note: report?.totals.warnings ? "Check scan output" : "Clear",
      tone: report?.totals.warnings ? "text-orange-700" : "text-slate-500",
    },
    {
      label: "Errors",
      value: report?.totals.errors ?? 0,
      note: report?.totals.errors ? "Action needed" : "Clear",
      tone: report?.totals.errors ? "text-red-700" : "text-slate-500",
    },
  ];

  return (
    <section className="mb-5 rounded-lg border border-slate-200 bg-white shadow-sm ring-1 ring-slate-950/[0.03]">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-slate-100 px-5 py-4">
        <h2 className="text-base font-semibold tracking-tight text-slate-950">Overview</h2>
        <p className="text-xs text-slate-500">
          {loading ? "Loading latest report" : generatedLabel}
        </p>
      </div>

      <div className="grid gap-px bg-slate-200/70 md:grid-cols-3 xl:grid-cols-7">
        {metrics.map((metric) => (
          <div className="bg-white px-5 py-4" key={metric.label}>
            <p className="text-xs font-medium text-slate-500">{metric.label}</p>
            <p className="mt-2 text-2xl font-semibold tabular-nums text-slate-950">
              {metric.value}
            </p>
            <p className={`mt-2 text-xs font-semibold ${metric.tone}`}>{metric.note}</p>
          </div>
        ))}

        <div className="bg-white px-5 py-4">
          <p className="text-xs font-medium text-slate-500">Last updated</p>
          <p className="mt-2 text-sm font-semibold text-slate-950">
            {formatDate(report?.generatedAt)}
          </p>
          <button
            className="mt-2 inline-flex items-center gap-1.5 rounded-md text-xs font-semibold text-blue-700 transition-colors hover:text-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-300"
            onClick={onRefresh}
            type="button"
          >
            <Icon className="size-3.5" name="refresh" />
            Refresh
          </button>
        </div>
      </div>
    </section>
  );
}

function SelectFilter({
  label,
  options,
  value,
  onChange,
  allLabel,
}: {
  label: string;
  options: string[];
  value: string;
  onChange: (value: string) => void;
  allLabel: string;
}) {
  return (
    <label className="block min-w-0">
      <span className="text-xs font-semibold text-slate-500">{label}</span>
      <select
        className="mt-1 block min-h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 shadow-sm transition-colors focus:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-100"
        onChange={(event) => onChange(event.target.value)}
        value={value}
      >
        <option value={ALL}>{allLabel}</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

function FiltersPanel({
  ecosystem,
  risk,
  priority,
  updateType,
  breakingOnly,
  filterOptions,
  filteredUpdateCount,
  totalUpdateCount,
  onEcosystemChange,
  onRiskChange,
  onPriorityChange,
  onUpdateTypeChange,
  onBreakingOnlyChange,
  onClear,
}: {
  ecosystem: string;
  risk: string;
  priority: string;
  updateType: string;
  breakingOnly: boolean;
  filterOptions: {
    ecosystems: string[];
    risks: string[];
    priorities: string[];
    updateTypes: string[];
  };
  filteredUpdateCount: number;
  totalUpdateCount: number;
  onEcosystemChange: (value: string) => void;
  onRiskChange: (value: string) => void;
  onPriorityChange: (value: string) => void;
  onUpdateTypeChange: (value: string) => void;
  onBreakingOnlyChange: (value: boolean) => void;
  onClear: () => void;
}) {
  return (
    <section className="mb-5 rounded-lg border border-slate-200 bg-white p-4 shadow-sm ring-1 ring-slate-950/[0.02]">
      <div className="grid items-end gap-3 lg:grid-cols-[repeat(4,minmax(9rem,1fr))_auto]">
        <SelectFilter
          allLabel="All ecosystems"
          label="Ecosystem"
          onChange={onEcosystemChange}
          options={filterOptions.ecosystems}
          value={ecosystem}
        />
        <SelectFilter
          allLabel="All risks"
          label="Risk"
          onChange={onRiskChange}
          options={filterOptions.risks}
          value={risk}
        />
        <SelectFilter
          allLabel="All priorities"
          label="Priority"
          onChange={onPriorityChange}
          options={filterOptions.priorities}
          value={priority}
        />
        <SelectFilter
          allLabel="All update types"
          label="Update type"
          onChange={onUpdateTypeChange}
          options={filterOptions.updateTypes}
          value={updateType}
        />
        <label className="flex min-h-10 items-center gap-2 whitespace-nowrap rounded-lg px-2 text-sm font-medium text-slate-700">
          <input
            checked={breakingOnly}
            className="size-4 rounded border-slate-300 text-blue-700 focus:ring-blue-200"
            onChange={(event) => onBreakingOnlyChange(event.target.checked)}
            type="checkbox"
          />
          Breaking changes only
        </label>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-slate-500">
          Showing {filteredUpdateCount} of {totalUpdateCount} updates.
        </p>
        <button
          className="inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 shadow-sm transition-colors hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-300"
          onClick={onClear}
          type="button"
        >
          <Icon className="size-3.5" name="x" />
          Clear filters
        </button>
      </div>
    </section>
  );
}

function RowsTable({
  rows,
  activeTab,
  selectedKey,
  onSelect,
}: {
  rows: RowModel[];
  activeTab: ActiveTab;
  selectedKey: string | null;
  onSelect: (key: string) => void;
}) {
  const isDependenciesTab = activeTab === "dependencies";

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm ring-1 ring-slate-950/[0.02]">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200 text-left">
          <thead className="bg-slate-50">
            <tr>
              <th className="min-w-72 px-4 py-3 text-xs font-semibold text-slate-500" scope="col">
                {isDependenciesTab ? "Package" : "Project"}
              </th>
              <th className="px-4 py-3 text-xs font-semibold text-slate-500" scope="col">
                Ecosystem
              </th>
              {isDependenciesTab ? (
                <>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500" scope="col">
                    Current
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500" scope="col">
                    Available
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500" scope="col">
                    Type
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500" scope="col">
                    Risk
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500" scope="col">
                    Release date
                  </th>
                </>
              ) : (
                <>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500" scope="col">
                    Outdated
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500" scope="col">
                    Breaking changes
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500" scope="col">
                    Highest risk
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500" scope="col">
                    Last updated
                  </th>
                </>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {rows.map((row) => {
              const selected = row.key === selectedKey;
              return (
                <tr
                  className={`cursor-pointer transition-colors ${
                    selected ? "bg-blue-50/70 ring-1 ring-inset ring-blue-200" : "hover:bg-slate-50"
                  }`}
                  key={row.key}
                  onClick={() => onSelect(row.key)}
                >
                  <td className="px-4 py-4">
                    <div className="flex items-center gap-3">
                      <div
                        className={`flex size-10 shrink-0 items-center justify-center rounded-lg border text-sm font-semibold ${
                          selected
                            ? "border-blue-200 bg-white text-blue-700"
                            : "border-slate-200 bg-slate-50 text-slate-600"
                        }`}
                      >
                        {row.name.slice(0, 2).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-950">{row.name}</p>
                        <p className="mt-1 truncate text-xs text-slate-500">{row.sublabel}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <span
                      className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ring-1 ${ecosystemTone(
                        row.ecosystem
                      )}`}
                    >
                      {row.ecosystem}
                    </span>
                  </td>
                  {isDependenciesTab ? (
                    <>
                      <td className="whitespace-nowrap px-4 py-4 font-mono text-xs font-semibold text-slate-600">
                        {labelFor(row.update.currentVersion)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-4 font-mono text-xs font-bold text-slate-950">
                        {labelFor(row.update.latestVersion)}
                      </td>
                      <td className="px-4 py-4">
                        <Badge className={toneFor(row.updateType)}>{row.updateType}</Badge>
                      </td>
                      <td className="px-4 py-4">
                        <Badge className={toneFor(row.risk)}>{labelFor(row.risk, "None")}</Badge>
                      </td>
                      <td className="whitespace-nowrap px-4 py-4 text-sm text-slate-600">
                        {formatDate(row.releaseDate)}
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="px-4 py-4 text-sm font-medium tabular-nums text-slate-900">
                        {row.outdatedCount}
                      </td>
                      <td className="px-4 py-4 text-sm font-medium tabular-nums text-red-700">
                        {row.breakingCount}
                      </td>
                      <td className="px-4 py-4">
                        <Badge className={toneFor(row.risk)}>{labelFor(row.risk, "None")}</Badge>
                      </td>
                      <td className="whitespace-nowrap px-4 py-4 text-sm text-slate-600">
                        {formatDate(row.lastUpdated)}
                      </td>
                    </>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ListPanel({
  rows,
  activeTab,
  selectedKey,
  searchQuery,
  onSelect,
  onTabChange,
  onSearchChange,
}: {
  rows: RowModel[];
  activeTab: ActiveTab;
  selectedKey: string | null;
  searchQuery: string;
  onSelect: (key: string) => void;
  onTabChange: (tab: ActiveTab) => void;
  onSearchChange: (value: string) => void;
}) {
  return (
    <section className="min-w-0">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-3 shadow-sm">
        <div className="flex rounded-lg bg-slate-100 p-1">
          {(["projects", "dependencies"] as ActiveTab[]).map((tab) => (
            <button
              className={`min-h-9 rounded-md px-3 text-sm font-semibold capitalize transition-colors focus:outline-none focus:ring-2 focus:ring-blue-200 ${
                activeTab === tab
                  ? "bg-white text-blue-700 shadow-sm"
                  : "text-slate-600 hover:text-slate-950"
              }`}
              key={tab}
              onClick={() => onTabChange(tab)}
              type="button"
            >
              {tab}
            </button>
          ))}
        </div>

        <label className="relative w-full sm:w-80">
          <Icon
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400"
            name="search"
          />
          <input
            className="min-h-10 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm text-slate-800 shadow-sm transition-colors placeholder:text-slate-400 focus:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-100"
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Search projects or packages..."
            type="search"
            value={searchQuery}
          />
        </label>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          message="No rows match the selected filters. Clear one or more filters to broaden the list."
          title="No matching dependency updates"
        />
      ) : (
        <>
          <RowsTable
            activeTab={activeTab}
            onSelect={onSelect}
            rows={rows}
            selectedKey={selectedKey}
          />
          <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
            <span>
              Showing {rows.length} {activeTab === "projects" ? "projects" : "dependencies"}
            </span>
            <div className="flex items-center gap-1">
              <button
                className="flex size-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-400"
                type="button"
              >
                1
              </button>
            </div>
          </div>
        </>
      )}
    </section>
  );
}

function DetailTabs({ row }: { row: RowModel }) {
  const [activeDetailTab, setActiveDetailTab] = useState<DetailTab>("notes");
  const release = row.update.releaseInfo;
  const notes = release.releaseNotesExcerpt || "No release notes excerpt available.";
  const breaking =
    release.aiBreakingChanges.length > 0
      ? release.aiBreakingChanges
      : ["No breaking changes were detected in the collected release data."];
  const notable =
    release.aiNotableChanges.length > 0
      ? release.aiNotableChanges.slice(0, 5)
      : ["No notable changes were extracted for this update."];
  const evidence =
    release.aiEvidenceUrls.length > 0
      ? release.aiEvidenceUrls
      : [release.changelogUrl].filter(Boolean);

  const tabs: Array<{ key: DetailTab; label: string; count?: number }> = [
    { key: "notes", label: "Notes" },
    { key: "breaking", label: "Breaking", count: release.aiBreakingChanges.length },
    { key: "notable", label: "Notable", count: release.aiNotableChanges.length },
    { key: "evidence", label: "Evidence", count: evidence.length },
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col border-t border-slate-200">
      <div className="grid grid-cols-4 border-b border-slate-200 bg-slate-50/80 p-1">
        {tabs.map((tab) => (
          <button
            className={`min-h-9 rounded-md px-2 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-blue-200 ${
              activeDetailTab === tab.key
                ? "bg-white text-blue-700 shadow-sm"
                : "text-slate-500 hover:bg-white/70 hover:text-slate-900"
            }`}
            key={tab.key}
            onClick={() => setActiveDetailTab(tab.key)}
            type="button"
          >
            <span className="block truncate">
              {tab.label}
              {typeof tab.count === "number" ? ` ${tab.count}` : ""}
            </span>
          </button>
        ))}
      </div>

      <div className="min-h-0 overflow-y-auto p-4">
        {activeDetailTab === "notes" && (
          <div>
            <h4 className="text-sm font-semibold text-slate-950">Release notes</h4>
            <p className="mt-2 text-sm leading-6 text-slate-600">{notes}</p>
          </div>
        )}

        {activeDetailTab === "breaking" && (
          <div>
            <h4 className="text-sm font-semibold text-slate-950">Breaking changes</h4>
            <ul className="mt-3 space-y-2 text-sm leading-5 text-slate-600">
              {breaking.map((item) => (
                <li className="rounded-lg border border-red-100 bg-red-50 px-3 py-2" key={item}>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        )}

        {activeDetailTab === "notable" && (
          <div>
            <h4 className="text-sm font-semibold text-slate-950">Notable changes</h4>
            <ul className="mt-3 space-y-2 text-sm leading-5 text-slate-600">
              {notable.map((item) => (
                <li className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2" key={item}>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        )}

        {activeDetailTab === "evidence" && (
          <div>
            <h4 className="text-sm font-semibold text-slate-950">Evidence</h4>
            <div className="mt-3 flex flex-wrap gap-2">
              {evidence.length > 0 ? (
                evidence.map((url) => (
                  <ExternalLink href={url} key={url}>
                    Source
                  </ExternalLink>
                ))
              ) : (
                <p className="text-sm text-slate-500">No evidence links were collected.</p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function DetailPanel({ row }: { row: RowModel | null }) {
  if (!row) {
    return (
      <aside className="rounded-lg border border-slate-200 bg-white p-6 text-sm text-slate-500 shadow-sm">
        Select a row to inspect release notes, breaking changes, evidence, and recommendations.
      </aside>
    );
  }

  const release = row.update.releaseInfo;
  const hasBreakingChanges = release.aiBreakingChanges.length > 0;
  const suggestion =
    release.aiSuggestedAction ||
    (hasBreakingChanges
      ? "Review breaking changes and test this update in a staging environment before upgrading."
      : "Low-friction update. Review release notes, then batch with adjacent dependency updates.");

  return (
    <aside className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-md ring-1 ring-slate-950/[0.03] xl:sticky xl:top-4 xl:flex xl:max-h-[calc(100vh-2rem)] xl:min-h-0 xl:flex-col">
      <div className="shrink-0 p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="truncate text-lg font-semibold tracking-tight text-slate-950">
                {row.name}
              </h3>
              <span
                className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ring-1 ${ecosystemTone(
                  row.ecosystem
                )}`}
              >
                {row.ecosystem}
              </span>
              {hasBreakingChanges && (
                <Badge className="border-red-200 bg-red-50 text-red-700">Breaking changes</Badge>
              )}
            </div>
            <p className="mt-1 truncate text-xs text-slate-500">{row.sublabel}</p>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-xs font-medium text-slate-500">Current</p>
            <p className="mt-1 font-mono font-semibold text-slate-950">
              {labelFor(row.update.currentVersion)}
            </p>
          </div>
          <div>
            <p className="text-xs font-medium text-slate-500">Latest</p>
            <p className="mt-1 font-mono font-semibold text-slate-950">
              {labelFor(row.update.latestVersion)}
            </p>
          </div>
          <div>
            <p className="text-xs font-medium text-slate-500">Update type</p>
            <p className="mt-1 font-semibold text-slate-950">{row.updateType}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-slate-500">Release date</p>
            <p className="mt-1 font-semibold text-slate-950">{formatDate(row.releaseDate)}</p>
          </div>
        </div>

        <div className="mt-5 rounded-lg border border-slate-200 bg-slate-50 p-4">
          <div className="mb-3 flex flex-wrap gap-2">
            <Badge className={toneFor(row.priority)}>
              Priority: {labelFor(row.priority, "None")}
            </Badge>
            <Badge className={toneFor(row.risk)}>Risk: {labelFor(row.risk, "None")}</Badge>
          </div>
          <p className="text-sm leading-6 text-slate-700">
            {release.aiSummary ||
              (hasBreakingChanges
                ? "This update includes breaking changes that may require code changes."
                : "No breaking changes were detected in the collected release data.")}
          </p>
          <div className="mt-3 flex flex-wrap gap-1">
            <ExternalLink href={release.homepageUrl}>Homepage</ExternalLink>
            <ExternalLink href={release.repositoryUrl}>Repository</ExternalLink>
            <ExternalLink href={release.changelogUrl}>Changelog</ExternalLink>
          </div>
        </div>
      </div>

      <DetailTabs key={row.key} row={row} />

      <div className="shrink-0 border-t border-slate-200 bg-blue-50/70 p-4">
        <div className="rounded-lg border border-blue-100 bg-white/80 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <Icon className="size-4 text-blue-700" name="spark" />
            <p className="text-sm font-semibold text-slate-950">AI Suggestion</p>
            <Badge className="border-blue-200 bg-blue-50 text-blue-700">Beta</Badge>
          </div>
          <p className="mt-2 line-clamp-2 text-sm leading-6 text-slate-700">{suggestion}</p>
          <button
            className="mt-3 inline-flex min-h-8 items-center rounded-lg border border-blue-200 bg-white px-3 text-xs font-semibold text-blue-700 shadow-sm transition-colors hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-blue-200"
            type="button"
          >
            View suggestion
          </button>
        </div>
      </div>
    </aside>
  );
}

function buildRows(
  projects: DependencyProject[],
  tab: ActiveTab,
  generatedAt: string | null
): RowModel[] {
  if (tab === "dependencies") {
    return projects.flatMap((project) =>
      project.updates.map((update) => ({
        key: `dependency:${update.id}`,
        kind: "dependencies" as ActiveTab,
        name: update.packageName,
        sublabel: compactPath(project.path),
        ecosystem: update.ecosystem,
        project,
        update,
        outdatedCount: 1,
        breakingCount: update.releaseInfo.aiBreakingChanges.length,
        risk: update.releaseInfo.aiRisk,
        priority: update.releaseInfo.aiPriority,
        updateType: updateTypeFor(update),
        releaseDate: update.releaseInfo.latestReleaseDate,
        lastUpdated: generatedAt,
      }))
    );
  }

  return projects.map((project) => {
    const update = topUpdateFor(project);
    const risk = highestRisk(project.updates);
    return {
      key: `project:${project.path}`,
      kind: "projects",
      name: compactPath(project.path),
      sublabel: project.manifests.join(", ") || project.path,
      ecosystem: project.ecosystems[0] ?? update.ecosystem,
      project,
      update,
      outdatedCount: project.updates.length,
      breakingCount: project.updates.reduce(
        (count, item) => count + item.releaseInfo.aiBreakingChanges.length,
        0
      ),
      risk,
      priority: highestPriority(project.updates),
      updateType: updateTypeFor(update),
      releaseDate: update.releaseInfo.latestReleaseDate,
      lastUpdated: generatedAt,
    };
  });
}

function applyProjectFilters({
  report,
  ecosystem,
  risk,
  priority,
  updateType,
  breakingOnly,
}: {
  report: DependencyUpdatesReport | null;
  ecosystem: string;
  risk: string;
  priority: string;
  updateType: string;
  breakingOnly: boolean;
}): DependencyProject[] {
  if (!report) return [];

  return report.projects
    .map((project) => ({
      ...project,
      updates: project.updates.filter((update) => {
        if (ecosystem !== ALL && update.ecosystem !== ecosystem) return false;
        if (risk !== ALL && update.releaseInfo.aiRisk !== risk) return false;
        if (priority !== ALL && update.releaseInfo.aiPriority !== priority) return false;
        if (updateType !== ALL && updateTypeFor(update) !== updateType) return false;
        if (breakingOnly && update.releaseInfo.aiBreakingChanges.length === 0) return false;
        return true;
      }),
    }))
    .filter((project) => project.updates.length > 0);
}

export default function DependencyUpdatesDashboard() {
  const { report, loading, error, refetch, runReport, status, running } = useDependencyUpdates();
  const [activeTab, setActiveTab] = useState<ActiveTab>("projects");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [ecosystem, setEcosystem] = useState(ALL);
  const [risk, setRisk] = useState(ALL);
  const [priority, setPriority] = useState(ALL);
  const [updateType, setUpdateType] = useState(ALL);
  const [breakingOnly, setBreakingOnly] = useState(false);

  const allUpdates = useMemo(
    () => (report?.projects ?? []).flatMap((project) => project.updates),
    [report]
  );

  const filterOptions = useMemo(() => {
    const ecosystems = new Set<string>();
    const risks = new Set<string>();
    const priorities = new Set<string>();
    const updateTypes = new Set<string>();

    for (const update of allUpdates) {
      ecosystems.add(update.ecosystem);
      updateTypes.add(updateTypeFor(update));
      if (update.releaseInfo.aiRisk) risks.add(update.releaseInfo.aiRisk);
      if (update.releaseInfo.aiPriority) priorities.add(update.releaseInfo.aiPriority);
    }

    return {
      ecosystems: Array.from(ecosystems).sort(),
      risks: Array.from(risks).sort(),
      priorities: Array.from(priorities).sort(),
      updateTypes: Array.from(updateTypes).sort(),
    };
  }, [allUpdates]);

  const filteredProjects = useMemo(
    () =>
      applyProjectFilters({
        breakingOnly,
        ecosystem,
        priority,
        report,
        risk,
        updateType,
      }),
    [breakingOnly, ecosystem, priority, report, risk, updateType]
  );

  const baseRows = useMemo(
    () => buildRows(filteredProjects, activeTab, report?.generatedAt ?? null),
    [activeTab, filteredProjects, report?.generatedAt]
  );

  const rows = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return baseRows;

    return baseRows.filter((row) => {
      const haystack = [
        row.name,
        row.sublabel,
        row.ecosystem,
        row.project.path,
        row.update.packageName,
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [baseRows, searchQuery]);

  const activeKey = rows.some((row) => row.key === selectedKey)
    ? selectedKey
    : (rows[0]?.key ?? null);
  const selectedRow = rows.find((row) => row.key === activeKey) ?? null;
  const filteredUpdateCount = filteredProjects.reduce(
    (count, project) => count + project.updates.length,
    0
  );
  const breakingCount = allUpdates.reduce(
    (count, update) => count + update.releaseInfo.aiBreakingChanges.length,
    0
  );

  function clearFilters() {
    setSearchQuery("");
    setEcosystem(ALL);
    setRisk(ALL);
    setPriority(ALL);
    setUpdateType(ALL);
    setBreakingOnly(false);
  }

  function exportReport() {
    if (!report || typeof window === "undefined") return;
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = report.reportFileName ?? "dependency-updates-report.json";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function handleRunReport() {
    try {
      await runReport();
    } catch (runErrorValue) {
      // The shared status endpoint owns the durable job error; this catches
      // request failures before a job could be created.
      console.error(runErrorValue);
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-[116rem]">
        <PageHeader
          loading={loading}
          onExport={exportReport}
          onRunReport={handleRunReport}
          report={report}
          running={running}
        />
        <LoadingState />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[116rem]">
      <PageHeader
        loading={loading}
        onExport={exportReport}
        onRunReport={handleRunReport}
        report={report}
        running={running}
      />

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {running && (
        <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
          Dependency report is running{status?.scope ? ` for ${status.scope}` : ""}. This page will
          update when it finishes.
        </div>
      )}

      {status?.status === "succeeded" && (
        <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          Dependency report completed. The latest report is shown below.
        </div>
      )}

      {(status?.status === "failed" || status?.status === "interrupted") && status.error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {status.error}
        </div>
      )}

      {report?.runMode === "host" && <HostReportCommand command={report.command} />}

      {report?.status === "missing" ? (
        <EmptyState
          command={report.command}
          message="No dependency report JSON was found. Generate a fresh report, then refresh this page."
          title="No dependency report found"
        />
      ) : report && report.totals.updates === 0 ? (
        <EmptyState
          message="The latest report did not include outdated direct dependencies."
          title="No outdated direct dependencies"
        />
      ) : (
        <>
          <OverviewSummary
            breakingCount={breakingCount}
            loading={loading}
            onRefresh={() => refetch()}
            report={report}
          />

          <FiltersPanel
            breakingOnly={breakingOnly}
            ecosystem={ecosystem}
            filteredUpdateCount={filteredUpdateCount}
            filterOptions={filterOptions}
            onBreakingOnlyChange={setBreakingOnly}
            onClear={clearFilters}
            onEcosystemChange={setEcosystem}
            onPriorityChange={setPriority}
            onRiskChange={setRisk}
            onUpdateTypeChange={setUpdateType}
            priority={priority}
            risk={risk}
            totalUpdateCount={report?.totals.updates ?? 0}
            updateType={updateType}
          />

          <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_29rem]">
            <ListPanel
              activeTab={activeTab}
              onSelect={setSelectedKey}
              onSearchChange={setSearchQuery}
              onTabChange={(tab) => {
                setActiveTab(tab);
                setSelectedKey(null);
              }}
              rows={rows}
              searchQuery={searchQuery}
              selectedKey={activeKey}
            />
            <DetailPanel row={selectedRow} />
          </div>
        </>
      )}
    </div>
  );
}
