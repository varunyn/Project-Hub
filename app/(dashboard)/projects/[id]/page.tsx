"use client";

import Image from "next/image";
import Link from "next/link";
import { notFound, useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { siCursor } from "simple-icons";
import useSWR from "swr";
import { pushRecentProjectId } from "../../../components/Sidebar";
import { useProject } from "../../../hooks/useProject";
import { useProjects } from "../../../hooks/useProjects";
import {
  formatCommitDate,
  formatLastActivity,
  getStatusColor,
  getStatusDotColor,
} from "../../../utils/format";

type GitCommit = { hash: string; subject: string; date: string };

async function fetcherGitLog(url: string): Promise<GitCommit[]> {
  const res = await fetch(url);
  if (!res.ok) return [];
  const data = (await res.json()) as { commits?: GitCommit[] };
  return data.commits ?? [];
}

const CURSOR_ICON_PATH = siCursor.path;

export default function ProjectDetailPage() {
  const params = useParams();
  const id = typeof params.id === "string" ? params.id : null;
  const { project, loading, refetch, updateProject } = useProject(id);
  const { projects } = useProjects();
  const [copyPathFeedback, setCopyPathFeedback] = useState(false);
  const [tagInput, setTagInput] = useState("");
  const [noteInput, setNoteInput] = useState("");
  const [goalInput, setGoalInput] = useState("");

  const gitLogKey = project?.id ? `/api/projects/${project.id}/git-log` : null;
  const { data: gitCommits, isLoading: gitCommitsLoading } = useSWR<GitCommit[]>(
    gitLogKey,
    fetcherGitLog,
  );

  useEffect(() => {
    if (id) pushRecentProjectId(id);
  }, [id]);

  const sortedProjects = useMemo(
    () =>
      projects.toSorted(
        (a, b) => new Date(b.lastUpdated).getTime() - new Date(a.lastUpdated).getTime(),
      ),
    [projects],
  );
  const currentIndex = useMemo(
    () => (id ? sortedProjects.findIndex((p) => p.id === id) : -1),
    [id, sortedProjects],
  );
  const prevProject = currentIndex > 0 ? sortedProjects[currentIndex - 1] : null;
  const nextProject =
    currentIndex >= 0 && currentIndex < sortedProjects.length - 1
      ? sortedProjects[currentIndex + 1]
      : null;

  const pathForUri = useCallback((p: string) => p.replace(/\\/g, "/"), []);

  const handleShowInFinder = useCallback(async () => {
    if (!project?.path) return;
    try {
      const res = await fetch("/api/open-folder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: project.path }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        if (data.error?.toLowerCase().includes("not available")) {
          navigator.clipboard.writeText(project.path);
          setCopyPathFeedback(true);
          setTimeout(() => setCopyPathFeedback(false), 2000);
        }
      }
    } catch {
      navigator.clipboard.writeText(project.path);
      setCopyPathFeedback(true);
      setTimeout(() => setCopyPathFeedback(false), 2000);
    }
  }, [project]);

  const handleOpenInCursor = useCallback(() => {
    if (!project?.path) return;
    const uri = `cursor://file/${pathForUri(project.path)}`;
    window.open(uri, "_blank", "noopener");
  }, [project, pathForUri]);

  const handleOpenInVSCode = useCallback(() => {
    if (!project?.path) return;
    const uri = `vscode://file/${pathForUri(project.path)}`;
    window.open(uri, "_blank", "noopener");
  }, [project, pathForUri]);

  const handleCopyPath = useCallback(() => {
    if (!project?.path) return;
    navigator.clipboard.writeText(project.path);
    setCopyPathFeedback(true);
    setTimeout(() => setCopyPathFeedback(false), 1500);
  }, [project]);

  const handleTogglePin = useCallback(async () => {
    if (!project) return;
    await updateProject({ pinned: !project.pinned });
    refetch();
  }, [project, updateProject, refetch]);

  const handleAddTag = useCallback(async () => {
    const t = tagInput.trim();
    if (!t || !project) return;
    const tags = [...(project.tags ?? []), t];
    await updateProject({ tags });
    setTagInput("");
  }, [tagInput, project, updateProject]);

  const handleRemoveTag = useCallback(
    async (tag: string) => {
      if (!project?.tags) return;
      await updateProject({
        tags: project.tags.filter((x) => x !== tag),
      });
    },
    [project, updateProject],
  );

  const handleAddNote = useCallback(async () => {
    const n = noteInput.trim();
    if (!project) return;
    await updateProject({ notes: n || undefined });
    setNoteInput("");
    refetch();
  }, [noteInput, project, updateProject, refetch]);

  const handleAddGoal = useCallback(async () => {
    const g = goalInput.trim();
    if (!g || !project) return;
    const goals = [...(project.goals ?? []), g];
    await updateProject({ goals });
    setGoalInput("");
  }, [goalInput, project, updateProject]);

  const handleRemoveGoal = useCallback(
    async (goal: string) => {
      if (!project?.goals) return;
      await updateProject({
        goals: project.goals.filter((x) => x !== goal),
      });
    },
    [project, updateProject],
  );

  if (loading && !project) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <div className="animate-spin rounded-full h-10 w-10 border-2 border-slate-200 border-t-blue-500" />
      </div>
    );
  }

  if (!project) {
    notFound();
  }

  const cardClass =
    "rounded-xl border border-slate-200/80 bg-white p-5 shadow-sm ring-1 ring-slate-900/5";
  const sectionTitleClass = "text-sm font-semibold text-slate-900 tracking-tight mb-3";
  const inputClass =
    "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-colors";
  const btnPrimary =
    "inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors";

  const iconClass = "h-4 w-4 shrink-0";
  const description = project.notes?.trim() || project.readmePreview?.trim() || null;

  return (
    <div className="w-full">
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-[minmax(0,380px)_1fr] sm:gap-x-8">
        <div className="min-w-0 space-y-6">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-sm text-slate-600 hover:text-slate-900 transition-colors"
          >
            <span aria-hidden>←</span> Back to Projects
          </Link>

          <section className={cardClass}>
            <h2 className={sectionTitleClass}>Quick Actions</h2>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={handleShowInFinder}
                className="inline-flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-800 px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-500 focus:ring-offset-2 transition-colors text-left w-full max-w-xs"
              >
                <svg
                  className={iconClass}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
                  />
                </svg>
                Show in Finder
              </button>
              <button
                type="button"
                onClick={handleOpenInCursor}
                className="inline-flex items-center gap-3 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors text-left w-full max-w-xs"
              >
                <svg className={iconClass} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                  <path d={CURSOR_ICON_PATH} />
                </svg>
                Open in Cursor
              </button>
              <button
                type="button"
                onClick={handleOpenInVSCode}
                className="inline-flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-800 px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-500 focus:ring-offset-2 transition-colors text-left w-full max-w-xs"
              >
                <Image
                  src="/vscode.svg"
                  alt=""
                  width={16}
                  height={16}
                  className={iconClass}
                  aria-hidden
                />
                Open in VS Code
              </button>
              {project.githubUrl && (
                <a
                  href={project.githubUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-800 px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-500 focus:ring-offset-2 transition-colors text-left w-full max-w-xs"
                >
                  <svg className={iconClass} fill="currentColor" viewBox="0 0 24 24">
                    <path
                      fillRule="evenodd"
                      d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
                      clipRule="evenodd"
                    />
                  </svg>
                  Open in GitHub
                </a>
              )}
              <button
                type="button"
                onClick={handleCopyPath}
                className="inline-flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-800 px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-500 focus:ring-offset-2 transition-colors text-left w-full max-w-xs"
              >
                <svg
                  className={iconClass}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                  />
                </svg>
                {copyPathFeedback ? "Copied!" : "Copy Path"}
              </button>
            </div>
          </section>

          {(project.devServerUrl || project.startCommand) && (
            <section className={cardClass}>
              <h2 className={sectionTitleClass}>Overview</h2>
              <div className="text-sm text-slate-700 space-y-1.5">
                {project.devServerUrl && (
                  <p>
                    The dev server runs at:{" "}
                    <strong className="font-medium text-slate-900">{project.devServerUrl}</strong>
                  </p>
                )}
                {project.startCommand && (
                  <p>
                    Start with:{" "}
                    <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-slate-800">
                      {project.startCommand}
                    </code>
                  </p>
                )}
              </div>
            </section>
          )}

          <section className={cardClass}>
            <h2 className={sectionTitleClass}>Details</h2>
            <ul className="text-sm text-slate-600 space-y-1.5">
              <li>
                <span className="font-medium text-slate-700">Path:</span>{" "}
                <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-slate-800 break-all">
                  {project.path}
                </code>
              </li>
              <li className="flex items-center gap-2">
                <span className="font-medium text-slate-700">Type:</span>{" "}
                {project.projectType ? (
                  <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700 ring-1 ring-slate-200/60">
                    {project.projectType}
                  </span>
                ) : (
                  "—"
                )}
              </li>
            </ul>
          </section>

          <section className={cardClass}>
            <h2 className={sectionTitleClass}>Tags</h2>
            <div className="flex flex-wrap gap-2 mb-3">
              {(project.tags ?? []).map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-700 ring-1 ring-slate-200/60"
                >
                  {tag}
                  <button
                    type="button"
                    onClick={() => handleRemoveTag(tag)}
                    className="ml-0.5 rounded-full p-0.5 text-slate-400 hover:bg-red-100 hover:text-red-600 focus:outline-none focus:ring-2 focus:ring-red-300"
                    aria-label={`Remove ${tag}`}
                  >
                    ×
                  </button>
                </span>
              ))}
              {(!project.tags || project.tags.length === 0) && (
                <span className="text-sm text-slate-500">No tags yet.</span>
              )}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Add tag..."
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAddTag()}
                className={`flex-1 max-w-xs ${inputClass}`}
              />
              <button type="button" onClick={handleAddTag} className={btnPrimary}>
                Add
              </button>
            </div>
          </section>

          <section className={cardClass}>
            <h2 className={sectionTitleClass}>Notes</h2>
            {project.notes && (
              <p className="text-sm text-slate-700 mb-3 whitespace-pre-wrap">{project.notes}</p>
            )}
            {!project.notes && <p className="text-sm text-slate-500 mb-3">No notes yet.</p>}
            <div className="flex flex-col gap-2 max-w-md">
              <textarea
                placeholder="Add a note..."
                value={noteInput}
                onChange={(e) => setNoteInput(e.target.value)}
                className={`min-h-[88px] ${inputClass}`}
              />
              <button type="button" onClick={handleAddNote} className={`w-full ${btnPrimary}`}>
                Add Note
              </button>
            </div>
          </section>

          <section className={cardClass}>
            <h2 className={sectionTitleClass}>Goals</h2>
            <ul className="text-sm text-slate-700 mb-3 space-y-1.5">
              {(project.goals ?? []).map((goal) => (
                <li key={goal} className="flex items-center gap-2">
                  <span className="flex-1">{goal}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveGoal(goal)}
                    className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600 focus:outline-none focus:ring-2 focus:ring-red-200"
                    aria-label={`Remove goal ${goal}`}
                  >
                    ×
                  </button>
                </li>
              ))}
              {(!project.goals || project.goals.length === 0) && (
                <li className="text-slate-500">No goals yet.</li>
              )}
            </ul>
            <div className="flex flex-col gap-2 max-w-md">
              <input
                type="text"
                placeholder="Add a goal..."
                value={goalInput}
                onChange={(e) => setGoalInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAddGoal()}
                className={inputClass}
              />
              <button type="button" onClick={handleAddGoal} className={`w-full ${btnPrimary}`}>
                Add Goal
              </button>
            </div>
          </section>

          <nav
            className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-200/80 bg-white px-5 py-4 shadow-sm ring-1 ring-slate-900/5"
            aria-label="Project navigation"
          >
            <div className="flex items-center gap-2">
              {prevProject ? (
                <Link
                  href={`/projects/${prevProject.id}`}
                  className="inline-flex items-center gap-2 text-sm font-medium text-slate-700 hover:text-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2 rounded-lg px-2 py-1 transition-colors"
                >
                  <svg
                    className="h-4 w-4 text-slate-500"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
                  </svg>
                  Previous Project
                  <span className="text-slate-500 font-normal truncate max-w-[120px]">
                    {prevProject.name}
                  </span>
                </Link>
              ) : (
                <span className="inline-flex items-center gap-2 text-sm text-slate-400">
                  <svg
                    className="h-4 w-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
                  </svg>
                  Previous Project
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {nextProject ? (
                <Link
                  href={`/projects/${nextProject.id}`}
                  className="inline-flex items-center gap-2 text-sm font-medium text-slate-700 hover:text-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2 rounded-lg px-2 py-1 transition-colors"
                >
                  <span className="text-slate-500 font-normal truncate max-w-[120px]">
                    {nextProject.name}
                  </span>
                  Next Project
                  <svg
                    className="h-4 w-4 text-slate-500"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </Link>
              ) : (
                <span className="inline-flex items-center gap-2 text-sm text-slate-400">
                  Next Project
                  <svg
                    className="h-4 w-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </span>
              )}
            </div>
          </nav>
        </div>

        <aside className="space-y-6 md:sticky md:top-6 md:self-start">
          <div className={cardClass}>
            <div className="flex flex-wrap justify-between items-start gap-3">
              <div className="min-w-0">
                <h1 className="text-xl font-semibold tracking-tight text-slate-900 mb-1.5">
                  {project.name}
                </h1>
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`inline-block size-2 rounded-full shrink-0 ${getStatusDotColor(project.status)}`}
                    aria-hidden
                  />
                  <span className="text-sm text-slate-600">
                    Last activity {formatLastActivity(project.lastUpdated)}
                  </span>
                  <span
                    className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${getStatusColor(
                      project.status,
                    )}`}
                  >
                    {project.status.replace(/-/g, " ")}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={handleTogglePin}
                className="shrink-0 rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-400/50 transition-colors"
                aria-label={project.pinned ? "Unpin" : "Pin"}
                title={project.pinned ? "Unpin" : "Pin"}
              >
                <span className={project.pinned ? "text-amber-500" : ""}>
                  {project.pinned ? "🔖" : "📌"}
                </span>
              </button>
            </div>
          </div>

          {description && (
            <div className={cardClass}>
              <h2 className={sectionTitleClass}>Description</h2>
              <p className="text-sm text-slate-700 whitespace-pre-wrap line-clamp-[12]">
                {description}
              </p>
            </div>
          )}

          {project.techStack.length > 0 && (
            <div className={cardClass}>
              <h2 className={sectionTitleClass}>Tech Stack</h2>
              <div className="flex flex-wrap gap-2">
                {project.techStack.map((tech) => (
                  <span
                    key={tech}
                    className="rounded-lg bg-slate-100 px-2.5 py-1 text-sm font-medium text-slate-700 ring-1 ring-slate-200/60"
                  >
                    {tech}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className={cardClass}>
            <h2 className={sectionTitleClass}>
              Recent Activity
              {gitCommits && gitCommits.length > 0
                ? ` (${gitCommits.length} commit${gitCommits.length === 1 ? "" : "s"})`
                : ""}
            </h2>
            {gitCommitsLoading ? (
              <p className="text-sm text-slate-500">Loading…</p>
            ) : gitCommits && gitCommits.length > 0 ? (
              <ul className="list-disc list-inside space-y-3 text-sm [&::marker]:text-blue-500">
                {gitCommits.map((c) => (
                  <li key={c.hash} className="flex flex-col gap-0.5">
                    <span className="text-slate-800 font-medium leading-tight">{c.subject}</span>
                    <span className="text-slate-500 text-xs">{formatCommitDate(c.date)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-slate-500">No recent activity.</p>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
