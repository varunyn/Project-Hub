"use client";

import Link from "next/link";
import type { Project } from "../types";
import { formatLastActivity, getStatusColor, getStatusDotColor } from "../utils/format";

interface ProjectDetailHeaderProps {
  project: Project;
  description: string | null;
  onCopyPath: () => void;
  onTogglePin: () => void;
}

export function ProjectDetailHeader({
  project,
  description,
  onCopyPath,
  onTogglePin,
}: ProjectDetailHeaderProps) {
  return (
    <>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/"
          className="inline-flex min-h-9 items-center gap-2 rounded-lg px-2 text-sm font-semibold text-[oklch(28%_0.08_265)] transition-colors hover:bg-[oklch(97%_0.025_245)] focus:outline-none focus:ring-2 focus:ring-[oklch(74%_0.12_230)]"
        >
          <span aria-hidden>←</span> Back to Quests
        </Link>
        <button
          type="button"
          onClick={onTogglePin}
          className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-[oklch(88%_0.07_75)] bg-[oklch(99%_0.025_75)] px-3 py-1.5 text-sm font-semibold text-[oklch(37%_0.09_75)] shadow-sm transition-colors hover:bg-[oklch(96%_0.045_75)] focus:outline-none focus:ring-2 focus:ring-[oklch(78%_0.16_75)] focus:ring-offset-2"
          aria-label={project.pinned ? "Unpin quest" : "Pin quest"}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className={`h-4 w-4 ${project.pinned ? "fill-amber-500 text-amber-500" : "text-[oklch(43%_0.1_75)]"}`}
            viewBox="0 0 24 24"
            fill={project.pinned ? "currentColor" : "none"}
            stroke="currentColor"
            strokeWidth={1.8}
            aria-hidden
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M7 4.75A1.75 1.75 0 0 1 8.75 3h6.5A1.75 1.75 0 0 1 17 4.75V21l-5-3-5 3V4.75Z"
            />
          </svg>
          {project.pinned ? "Pinned" : "Pin"}
        </button>
      </div>

      <section className="mb-5 overflow-hidden rounded-lg border border-[oklch(88%_0.03_255)] bg-[oklch(99%_0.006_245)] p-5 shadow-[0_1px_2px_oklch(25%_0.04_260_/_0.08)] ring-1 ring-[oklch(96%_0.025_255)]">
        <div className="flex flex-wrap items-center justify-between gap-5">
          <div className="min-w-0">
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-[oklch(45%_0.13_205)]">
              Quest
            </p>
            <h1 className="text-2xl font-semibold tracking-tight text-[oklch(24%_0.08_265)]">
              {project.name}
            </h1>
            {description && (
              <p className="mt-2 max-w-2xl truncate text-sm font-semibold text-[oklch(39%_0.06_260)]">
                {description}
              </p>
            )}
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <span
                className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold capitalize ${getStatusColor(project.status)}`}
              >
                <span aria-hidden>●</span>
                {project.status.replace(/-/g, " ")}
              </span>
              <span
                className={`inline-block size-2 shrink-0 rounded-full ${getStatusDotColor(project.status)}`}
                aria-hidden
              />
              <span className="text-sm font-medium text-[oklch(38%_0.06_260)]">
                Last activity {formatLastActivity(project.lastUpdated)}
              </span>
            </div>
          </div>
          {project.path && (
            <div className="flex max-w-full items-center gap-2 rounded-lg bg-[oklch(25%_0.065_265)] px-3 py-2 text-[oklch(97%_0.012_245)] shadow-sm ring-1 ring-[oklch(70%_0.12_235)] sm:max-w-[34rem]">
              <svg
                className="size-4 shrink-0"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                aria-hidden
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M4 7h6l2 2h8v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7Z"
                />
              </svg>
              <code className="min-w-0 flex-1 truncate font-mono text-xs">{project.path}</code>
              <button
                type="button"
                onClick={onCopyPath}
                className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-[oklch(90%_0.035_245)] transition-colors hover:bg-[oklch(36%_0.08_265)] focus:outline-none focus:ring-2 focus:ring-[oklch(74%_0.12_230)]"
                aria-label="Copy path"
              >
                <svg
                  className="size-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  aria-hidden
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M8 8h10v12H8zM6 16H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"
                  />
                </svg>
              </button>
            </div>
          )}
        </div>
      </section>
    </>
  );
}

export function ProjectDetailTabs({
  projectId,
  activeTab,
}: {
  projectId: string;
  activeTab: "overview" | "tasks";
}) {
  return (
    <nav
      className="mb-5 flex items-center gap-1 border-b border-[oklch(87%_0.035_255)]"
      aria-label="Project sections"
    >
      <Link
        href={`/projects/${projectId}`}
        className={`border-b-2 px-3 py-3 text-sm font-semibold transition-colors ${activeTab === "overview" ? "border-[oklch(28%_0.08_265)] text-[oklch(28%_0.08_265)]" : "border-transparent text-slate-500 hover:text-slate-800"}`}
        aria-current={activeTab === "overview" ? "page" : undefined}
      >
        Overview
      </Link>
      <Link
        href={`/projects/${projectId}?tab=tasks`}
        className={`inline-flex items-center gap-2 border-b-2 px-3 py-3 text-sm font-semibold transition-colors ${activeTab === "tasks" ? "border-[oklch(28%_0.08_265)] text-[oklch(28%_0.08_265)]" : "border-transparent text-slate-500 hover:text-slate-800"}`}
        aria-current={activeTab === "tasks" ? "page" : undefined}
      >
        Tasks{" "}
        <span className="rounded-full bg-[oklch(94%_0.04_245)] px-1.5 py-0.5 text-[11px] text-slate-500">
          workspace
        </span>
      </Link>
    </nav>
  );
}

export function ProjectDetailsCard({
  project,
  isEditing,
  onEdit,
}: {
  project: Project;
  isEditing: boolean;
  onEdit: () => void;
}) {
  return (
    <section className="rounded-lg border border-[oklch(88%_0.03_255)] bg-[oklch(99%_0.006_245)] p-4 shadow-[0_1px_2px_oklch(25%_0.04_260_/_0.08)] ring-1 ring-[oklch(96%_0.025_255)]">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="mb-0 text-base font-semibold tracking-tight text-[oklch(25%_0.07_260)]">
          Quest details
        </h2>
        <button
          type="button"
          onClick={onEdit}
          className="inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border border-[oklch(88%_0.035_255)] bg-[oklch(99%_0.006_245)] px-3 py-1.5 text-sm font-semibold text-[oklch(34%_0.07_255)] shadow-sm transition-colors hover:bg-[oklch(97%_0.025_245)] focus:outline-none focus:ring-2 focus:ring-[oklch(78%_0.1_230)] focus:ring-offset-2"
          aria-expanded={isEditing}
        >
          <svg
            className="size-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            aria-hidden
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M16.862 4.487 19.5 7.125 8.25 18.375 4.5 19.5l1.125-3.75L16.862 4.487Z"
            />
          </svg>
          {isEditing ? "Close" : "Edit"}
        </button>
      </div>
      <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="font-medium text-slate-500">Type</dt>
          <dd className="mt-1 font-semibold text-[oklch(27%_0.07_260)]">
            {project.projectType || "Not set"}
          </dd>
        </div>
        <div>
          <dt className="font-medium text-slate-500">Status</dt>
          <dd className="mt-1 font-semibold capitalize text-[oklch(36%_0.13_145)]">
            {project.status.replace(/-/g, " ")}
          </dd>
        </div>
        {project.devServerUrl && (
          <div>
            <dt className="font-medium text-slate-500">Dev server</dt>
            <dd className="mt-1 break-all text-slate-900">{project.devServerUrl}</dd>
          </div>
        )}
        {project.startCommand && (
          <div>
            <dt className="font-medium text-slate-500">Start command</dt>
            <dd className="mt-1">
              <code className="break-all rounded-md bg-[oklch(96%_0.035_75)] px-1.5 py-0.5 font-mono text-xs text-[oklch(33%_0.08_75)] ring-1 ring-[oklch(87%_0.08_75)]">
                {project.startCommand}
              </code>
            </dd>
          </div>
        )}
      </dl>
    </section>
  );
}
