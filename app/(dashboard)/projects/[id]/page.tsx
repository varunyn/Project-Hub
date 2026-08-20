"use client";

import Image from "next/image";
import Link from "next/link";
import { notFound, useParams, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { siCursor } from "simple-icons";
import useSWR from "swr";
import OverviewTaskSummary from "../../../components/OverviewTaskSummary";
import ProjectDependencyUpdates from "../../../components/ProjectDependencyUpdates";
import {
  ProjectDetailHeader,
  ProjectDetailsCard,
  ProjectDetailTabs,
} from "../../../components/ProjectDetailHeader";
import { ProjectEditableSections } from "../../../components/ProjectEditableSections";
import ProjectForm from "../../../components/ProjectForm";
import { pushRecentProjectId } from "../../../components/Sidebar";
import TaskWorkspace from "../../../components/TaskWorkspace";
import { useProject } from "../../../hooks/useProject";
import { useProjects } from "../../../hooks/useProjects";
import type { Project } from "../../../types";
import { formatCommitDate } from "../../../utils/format";

interface GitCommit {
  hash: string;
  subject: string;
  date: string;
}

async function fetcherGitLog(url: string): Promise<GitCommit[]> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) return [];
  const data = (await res.json()) as { commits?: GitCommit[] };
  return data.commits ?? [];
}

const CURSOR_ICON_PATH = siCursor.path;

export default function ProjectDetailPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const id = typeof params.id === "string" ? params.id : null;
  const { project, loading, refetch, updateProject } = useProject(id);
  const { projects } = useProjects();
  const [copyPathFeedback, setCopyPathFeedback] = useState(false);
  const [tagInput, setTagInput] = useState("");
  const [tagDropdownOpen, setTagDropdownOpen] = useState(false);
  const [tagHighlightIndex, setTagHighlightIndex] = useState(0);
  const tagDropdownRef = useRef<HTMLDivElement>(null);
  const [noteInput, setNoteInput] = useState("");
  const [isEditingNote, setIsEditingNote] = useState(false);
  const [goalInput, setGoalInput] = useState("");
  const isEditingProject = searchParams.get("edit") === "1";
  const activeTab = searchParams.get("tab") === "tasks" ? "tasks" : "overview";

  const gitLogKey = id ? `/api/projects/${id}/git-log` : null;
  const {
    data: gitCommits,
    isLoading: gitCommitsLoading,
    isValidating: gitCommitsValidating,
    mutate: refreshGitCommits,
  } = useSWR<GitCommit[]>(gitLogKey, fetcherGitLog, {
    dedupingInterval: 0,
    revalidateOnMount: true,
  });

  useEffect(() => {
    if (id) pushRecentProjectId(id);
  }, [id]);

  const sortedProjects = useMemo(
    () =>
      [...projects].sort(
        (a, b) => new Date(b.lastUpdated).getTime() - new Date(a.lastUpdated).getTime()
      ),
    [projects]
  );

  const currentIndex = useMemo(
    () => (id ? sortedProjects.findIndex((item) => item.id === id) : -1),
    [id, sortedProjects]
  );
  const prevProject = currentIndex > 0 ? sortedProjects[currentIndex - 1] : null;
  const nextProject =
    currentIndex >= 0 && currentIndex < sortedProjects.length - 1
      ? sortedProjects[currentIndex + 1]
      : null;

  const pathForUri = useCallback((path: string) => path.replace(/\\/g, "/"), []);

  const allTagsFromProjects = useMemo(() => {
    const set = new Set<string>();
    for (const item of projects) {
      for (const tag of item.tags ?? []) set.add(tag);
    }
    return Array.from(set).sort();
  }, [projects]);

  const currentProjectTags = useMemo(() => new Set(project?.tags ?? []), [project?.tags]);
  const allTagsLowerSet = useMemo(
    () => new Set(allTagsFromProjects.map((tag) => tag.toLowerCase())),
    [allTagsFromProjects]
  );

  const tagSuggestions = useMemo(() => {
    const query = tagInput.trim().toLowerCase();
    const existing = allTagsFromProjects.filter(
      (tag) => !currentProjectTags.has(tag) && (!query || tag.toLowerCase().includes(query))
    );
    const newTag = tagInput.trim();
    const canCreateNew =
      newTag !== "" &&
      !currentProjectTags.has(newTag) &&
      !allTagsLowerSet.has(newTag.toLowerCase());
    return { existing, canCreateNew, newTag };
  }, [allTagsFromProjects, currentProjectTags, allTagsLowerSet, tagInput]);

  const tagOptionCount = tagSuggestions.existing.length + (tagSuggestions.canCreateNew ? 1 : 0);
  const effectiveHighlightIndex =
    tagOptionCount > 0 ? Math.min(tagHighlightIndex, tagOptionCount - 1) : 0;

  const showCopyFeedback = useCallback((duration = 1500) => {
    setCopyPathFeedback(true);
    setTimeout(() => setCopyPathFeedback(false), duration);
  }, []);

  const handleRefreshGitCommits = useCallback(() => {
    refreshGitCommits();
  }, [refreshGitCommits]);

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
          showCopyFeedback(2000);
        }
      }
    } catch {
      navigator.clipboard.writeText(project.path);
      showCopyFeedback(2000);
    }
  }, [project, showCopyFeedback]);

  const handleOpenInCursor = useCallback(() => {
    if (!project?.path) return;
    window.open(`cursor://file/${pathForUri(project.path)}`, "_blank", "noopener");
  }, [project, pathForUri]);

  const handleOpenInVSCode = useCallback(() => {
    if (!project?.path) return;
    window.open(`vscode://file/${pathForUri(project.path)}`, "_blank", "noopener");
  }, [project, pathForUri]);

  const handleCopyPath = useCallback(() => {
    if (!project?.path) return;
    navigator.clipboard.writeText(project.path);
    showCopyFeedback();
  }, [project, showCopyFeedback]);

  const handleTogglePin = useCallback(async () => {
    if (!project) return;
    await updateProject({ pinned: !project.pinned });
    refetch();
  }, [project, updateProject, refetch]);

  const handleCloseProjectEdit = useCallback(() => {
    if (id) router.replace(`/projects/${id}`);
  }, [id, router]);

  const handleUpdateProjectDetails = useCallback(
    async (projectData: Partial<Project>) => {
      if (!project) return;
      await updateProject(projectData);
      handleCloseProjectEdit();
      refetch();
    },
    [project, updateProject, handleCloseProjectEdit, refetch]
  );

  useEffect(() => {
    if (!tagDropdownOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (tagDropdownRef.current && !tagDropdownRef.current.contains(event.target as Node)) {
        setTagDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [tagDropdownOpen]);

  const handleAddTag = useCallback(
    async (tagToAdd?: string) => {
      const tag = (tagToAdd ?? tagInput).trim();
      if (!(tag && project) || currentProjectTags.has(tag)) return;
      await updateProject({ tags: [...(project.tags ?? []), tag] });
      setTagInput("");
      setTagDropdownOpen(false);
      setTagHighlightIndex(0);
    },
    [tagInput, project, currentProjectTags, updateProject]
  );

  const handleTagKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Enter") {
        event.preventDefault();
        const tag =
          tagSuggestions.canCreateNew && effectiveHighlightIndex === tagSuggestions.existing.length
            ? tagSuggestions.newTag
            : tagSuggestions.existing[effectiveHighlightIndex];
        if (tag) handleAddTag(tag);
      } else if (event.key === "Escape") {
        setTagDropdownOpen(false);
      } else if (event.key === "ArrowDown" && tagOptionCount > 0) {
        event.preventDefault();
        setTagHighlightIndex((index) => (index + 1) % tagOptionCount);
      } else if (event.key === "ArrowUp" && tagOptionCount > 0) {
        event.preventDefault();
        setTagHighlightIndex((index) => (tagOptionCount + index - 1) % tagOptionCount);
      }
    },
    [tagOptionCount, tagSuggestions, effectiveHighlightIndex, handleAddTag]
  );

  const handleRemoveTag = useCallback(
    async (tag: string) => {
      if (!project?.tags) return;
      await updateProject({ tags: project.tags.filter((item) => item !== tag) });
    },
    [project, updateProject]
  );

  const handleAddNote = useCallback(async () => {
    const note = noteInput.trim();
    if (!project) return;
    await updateProject({ notes: note || undefined });
    setNoteInput("");
    refetch();
  }, [noteInput, project, updateProject, refetch]);

  const handleStartNoteEdit = useCallback(() => {
    setNoteInput(project?.notes ?? "");
    setIsEditingNote(true);
  }, [project?.notes]);

  const handleCancelNoteEdit = useCallback(() => {
    setNoteInput("");
    setIsEditingNote(false);
  }, []);

  const handleSaveNote = useCallback(async () => {
    if (!project) return;
    await updateProject({ notes: noteInput.trim() || undefined });
    setNoteInput("");
    setIsEditingNote(false);
    refetch();
  }, [noteInput, project, updateProject, refetch]);

  const handleDeleteNote = useCallback(async () => {
    if (!project?.notes?.trim()) {
      setNoteInput("");
      setIsEditingNote(false);
      return;
    }
    await updateProject({ notes: undefined });
    setNoteInput("");
    setIsEditingNote(false);
    refetch();
  }, [project?.notes, updateProject, refetch]);

  const handleAddGoal = useCallback(async () => {
    const goal = goalInput.trim();
    if (!(goal && project)) return;
    await updateProject({ goals: [...(project.goals ?? []), goal] });
    setGoalInput("");
  }, [goalInput, project, updateProject]);

  const handleRemoveGoal = useCallback(
    async (goal: string) => {
      if (!project?.goals) return;
      await updateProject({ goals: project.goals.filter((item) => item !== goal) });
    },
    [project, updateProject]
  );

  if (loading && !project) {
    return (
      <div className="mx-auto max-w-6xl animate-pulse">
        <div className="mb-6 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <div className="h-3 w-24 rounded bg-slate-200" />
          <div className="mt-4 h-7 w-72 max-w-full rounded bg-slate-200" />
          <div className="mt-3 h-4 w-96 max-w-full rounded bg-slate-100" />
        </div>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-6">
            <div className="h-48 rounded-lg border border-slate-200 bg-white shadow-sm" />
            <div className="h-56 rounded-lg border border-slate-200 bg-white shadow-sm" />
          </div>
          <div className="h-64 rounded-lg border border-slate-200 bg-white shadow-sm" />
        </div>
      </div>
    );
  }

  if (!project) {
    notFound();
  }

  const cardClass =
    "rounded-lg border border-[oklch(88%_0.03_255)] bg-[oklch(99%_0.006_245)] p-4 shadow-[0_1px_2px_oklch(25%_0.04_260_/_0.08)] ring-1 ring-[oklch(96%_0.025_255)]";
  const sectionTitleClass =
    "mb-3 text-base font-semibold tracking-tight text-[oklch(25%_0.07_260)]";
  const btnPrimary =
    "inline-flex min-h-9 items-center justify-center gap-2 rounded-lg bg-[oklch(28%_0.08_265)] px-3 py-1.5 text-sm font-semibold text-[oklch(98%_0.006_250)] shadow-sm transition-colors hover:bg-[oklch(34%_0.1_265)] focus:outline-none focus:ring-2 focus:ring-[oklch(72%_0.14_250)] focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-[oklch(91%_0.025_255)] disabled:text-[oklch(62%_0.05_255)] disabled:shadow-none";
  const btnSecondary =
    "inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border border-[oklch(88%_0.035_255)] bg-[oklch(99%_0.006_245)] px-3 py-1.5 text-sm font-semibold text-[oklch(34%_0.07_255)] shadow-sm transition-colors hover:bg-[oklch(97%_0.025_245)] focus:outline-none focus:ring-2 focus:ring-[oklch(78%_0.1_230)] focus:ring-offset-2";
  const btnDanger =
    "inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border border-[oklch(86%_0.08_25)] bg-[oklch(99%_0.015_25)] px-3 py-1.5 text-sm font-semibold text-[oklch(50%_0.16_25)] shadow-[0_2px_0_oklch(90%_0.06_25)] transition-colors hover:bg-[oklch(96%_0.045_25)] focus:outline-none focus:ring-2 focus:ring-[oklch(78%_0.13_25)] focus:ring-offset-2";
  const inputClass =
    "w-full min-h-9 rounded-lg border border-[oklch(88%_0.035_255)] bg-[oklch(99%_0.006_245)] px-3 py-1.5 text-sm text-[oklch(24%_0.045_260)] placeholder:text-[oklch(62%_0.055_255)] transition-colors focus:border-[oklch(67%_0.14_230)] focus:outline-none focus:ring-2 focus:ring-[oklch(74%_0.12_230_/_0.28)]";
  const actionPrimary =
    "inline-flex min-h-20 flex-col items-center justify-center gap-2 rounded-lg bg-[oklch(28%_0.08_265)] px-3 py-3 text-sm font-semibold text-[oklch(98%_0.006_250)] shadow-sm transition-colors hover:bg-[oklch(34%_0.1_265)] focus:outline-none focus:ring-2 focus:ring-[oklch(72%_0.14_250)] focus:ring-offset-2";
  const actionSecondary =
    "inline-flex min-h-20 flex-col items-center justify-center gap-2 rounded-lg border border-[oklch(88%_0.035_255)] bg-[oklch(99%_0.006_245)] px-3 py-3 text-sm font-semibold text-[oklch(28%_0.07_260)] shadow-sm transition-colors hover:bg-[oklch(97%_0.02_245)] focus:outline-none focus:ring-2 focus:ring-[oklch(78%_0.1_230)] focus:ring-offset-2";
  const description = project.notes?.trim() || project.readmePreview?.trim() || null;
  const hasTagInput = tagInput.trim().length > 0;
  const hasGoalInput = goalInput.trim().length > 0;
  const hasNoteInput = noteInput.trim().length > 0;

  return (
    <div className="mx-auto w-full max-w-7xl">
      <ProjectDetailHeader
        project={project}
        description={description}
        onCopyPath={handleCopyPath}
        onTogglePin={handleTogglePin}
      />

      {isEditingProject && (
        <div className="mb-5">
          <ProjectForm
            key={project.id}
            project={project}
            onSubmit={handleUpdateProjectDetails}
            onCancel={handleCloseProjectEdit}
          />
        </div>
      )}

      <ProjectDetailTabs projectId={project.id} activeTab={activeTab} />

      {activeTab === "tasks" ? (
        <TaskWorkspace
          projectId={project.id}
          projectName={project.name}
          githubUrl={project.githubUrl}
          onConnectGithub={() => router.replace(`/projects/${project.id}?edit=1`)}
        />
      ) : (
        <>
          <OverviewTaskSummary projectId={project.id} />
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_420px]">
            <div className="min-w-0 space-y-4">
              <section className={cardClass}>
                <h2 className={sectionTitleClass}>Quick actions</h2>
                <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                  <button type="button" onClick={handleOpenInCursor} className={actionPrimary}>
                    <svg className="size-7" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                      <path d={CURSOR_ICON_PATH} />
                    </svg>
                    Open in Cursor
                  </button>
                  <button type="button" onClick={handleOpenInVSCode} className={actionSecondary}>
                    <Image src="/vscode.svg" alt="" width={24} height={24} className="size-6" />
                    Open in VS Code
                  </button>
                  <button type="button" onClick={handleShowInFinder} className={actionSecondary}>
                    <svg
                      className="size-7"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M3 7v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-6l-2-2H5a2 2 0 0 0-2 2z"
                      />
                    </svg>
                    Show in Finder
                  </button>
                  {project.githubUrl && (
                    <a
                      href={project.githubUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={actionSecondary}
                    >
                      <svg className="size-7" fill="currentColor" viewBox="0 0 24 24">
                        <path
                          fillRule="evenodd"
                          d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0 1 12 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0 0 22 12.017C22 6.484 17.522 2 12 2z"
                          clipRule="evenodd"
                        />
                      </svg>
                      Open in GitHub
                    </a>
                  )}
                  <button type="button" onClick={handleCopyPath} className={actionSecondary}>
                    <svg
                      className="size-7"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M8 16H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v2m-6 12h8a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2h-8a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2z"
                      />
                    </svg>
                    {copyPathFeedback ? "Copied" : "Copy path"}
                  </button>
                </div>
              </section>

              <ProjectDetailsCard
                project={project}
                isEditing={isEditingProject}
                onEdit={() => {
                  if (!id) return;
                  if (isEditingProject) router.replace(`/projects/${id}`);
                  else router.replace(`/projects/${id}?edit=1`);
                }}
              />

              {project.path && <ProjectDependencyUpdates projectPath={project.path} />}

              {description && (
                <section className={cardClass}>
                  <h2 className={sectionTitleClass}>Summary</h2>
                  <p className="max-w-prose whitespace-pre-wrap text-sm leading-6 text-slate-700 line-clamp-[10]">
                    {description}
                  </p>
                </section>
              )}

              <ProjectEditableSections
                project={project}
                cardClass={cardClass}
                sectionTitleClass={sectionTitleClass}
                inputClass={inputClass}
                btnPrimary={btnPrimary}
                btnSecondary={btnSecondary}
                btnDanger={btnDanger}
                tagInput={tagInput}
                tagDropdownOpen={tagDropdownOpen}
                tagDropdownRef={tagDropdownRef}
                tagSuggestions={tagSuggestions}
                tagOptionCount={tagOptionCount}
                effectiveHighlightIndex={effectiveHighlightIndex}
                hasTagInput={hasTagInput}
                noteInput={noteInput}
                isEditingNote={isEditingNote}
                hasNoteInput={hasNoteInput}
                goalInput={goalInput}
                hasGoalInput={hasGoalInput}
                onTagInputChange={(value) => {
                  setTagInput(value);
                  setTagHighlightIndex(0);
                  setTagDropdownOpen(true);
                }}
                onTagFocus={() => setTagDropdownOpen(true)}
                onTagKeyDown={handleTagKeyDown}
                onAddTag={handleAddTag}
                onRemoveTag={handleRemoveTag}
                onNoteInputChange={setNoteInput}
                onAddNote={handleAddNote}
                onStartNoteEdit={handleStartNoteEdit}
                onCancelNoteEdit={handleCancelNoteEdit}
                onSaveNote={handleSaveNote}
                onDeleteNote={handleDeleteNote}
                onGoalInputChange={setGoalInput}
                onGoalKeyDown={(event) => {
                  if (event.key === "Enter") handleAddGoal();
                }}
                onAddGoal={handleAddGoal}
                onRemoveGoal={handleRemoveGoal}
              />

              <nav
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[oklch(86%_0.055_265)] bg-[oklch(99%_0.012_245)] px-4 py-3 shadow-[0_2px_0_oklch(82%_0.06_255)] ring-1 ring-[oklch(96%_0.045_255)]"
                aria-label="Quest navigation"
              >
                {prevProject ? (
                  <Link
                    href={`/projects/${prevProject.id}`}
                    className="inline-flex min-h-10 items-center gap-2 rounded-lg px-2 text-sm font-bold text-[oklch(37%_0.09_260)] transition-colors hover:bg-[oklch(96%_0.04_205)] hover:text-[oklch(31%_0.12_230)] focus:outline-none focus:ring-2 focus:ring-[oklch(74%_0.14_205)] focus:ring-offset-2"
                  >
                    <span aria-hidden>←</span>
                    <span>Previous</span>
                    <span className="max-w-[10rem] truncate font-normal text-slate-500">
                      {prevProject.name}
                    </span>
                  </Link>
                ) : (
                  <span className="inline-flex min-h-10 items-center gap-2 px-2 text-sm text-slate-400">
                    <span aria-hidden>←</span> Previous
                  </span>
                )}
                {nextProject ? (
                  <Link
                    href={`/projects/${nextProject.id}`}
                    className="inline-flex min-h-10 items-center gap-2 rounded-lg px-2 text-sm font-bold text-[oklch(37%_0.09_260)] transition-colors hover:bg-[oklch(96%_0.04_205)] hover:text-[oklch(31%_0.12_230)] focus:outline-none focus:ring-2 focus:ring-[oklch(74%_0.14_205)] focus:ring-offset-2"
                  >
                    <span className="max-w-[10rem] truncate font-normal text-slate-500">
                      {nextProject.name}
                    </span>
                    <span>Next</span>
                    <span aria-hidden>→</span>
                  </Link>
                ) : (
                  <span className="inline-flex min-h-10 items-center gap-2 px-2 text-sm text-slate-400">
                    Next <span aria-hidden>→</span>
                  </span>
                )}
              </nav>
            </div>

            <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
              {project.techStack.length > 0 && (
                <div className={cardClass}>
                  <h2 className={sectionTitleClass}>Tech stack</h2>
                  <div className="flex flex-wrap gap-2">
                    {project.techStack.map((tech) => (
                      <span
                        key={tech}
                        className="rounded-md bg-[oklch(96%_0.02_250)] px-2.5 py-1 text-sm font-medium text-[oklch(34%_0.07_260)] ring-1 ring-[oklch(88%_0.035_255)]"
                      >
                        {tech}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className={cardClass}>
                <div className="mb-4 flex items-center justify-between gap-3">
                  <h2 className={`${sectionTitleClass} !mb-0`}>Recent activity</h2>
                  <div className="flex shrink-0 items-center gap-2">
                    {gitCommits && gitCommits.length > 0 && (
                      <span className="rounded-full bg-[oklch(94%_0.04_245)] px-3 py-1 text-xs font-semibold text-[oklch(30%_0.08_260)] ring-1 ring-[oklch(86%_0.05_250)]">
                        {gitCommits.length} commit{gitCommits.length === 1 ? "" : "s"}
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={handleRefreshGitCommits}
                      disabled={gitCommitsValidating}
                      className="inline-flex min-h-9 items-center gap-2 rounded-md border border-[oklch(84%_0.035_255)] bg-white px-3 text-xs font-semibold text-[oklch(34%_0.08_260)] shadow-sm transition hover:border-[oklch(72%_0.08_250)] hover:bg-[oklch(97%_0.02_250)] disabled:cursor-not-allowed disabled:opacity-60"
                      aria-label="Refresh git history"
                      title="Refresh git history"
                    >
                      <svg
                        className={`size-3.5 ${gitCommitsValidating ? "animate-spin" : ""}`}
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={2.2}
                        aria-hidden
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M20 11a8.1 8.1 0 0 0-15.5-2M4 5v4h4m-4 4a8.1 8.1 0 0 0 15.5 2M20 19v-4h-4"
                        />
                      </svg>
                      Refresh
                    </button>
                  </div>
                </div>
                {gitCommitsLoading ? (
                  <div className="space-y-3">
                    <div className="h-4 w-5/6 animate-pulse rounded bg-[oklch(94%_0.05_205)]" />
                    <div className="h-4 w-2/3 animate-pulse rounded bg-[oklch(95%_0.06_75)]" />
                    <div className="h-4 w-4/5 animate-pulse rounded bg-[oklch(95%_0.05_310)]" />
                  </div>
                ) : gitCommits && gitCommits.length > 0 ? (
                  <div className="max-h-[34rem] overflow-y-auto pr-1">
                    <ul className="relative space-y-3 pl-7 text-sm before:absolute before:left-3 before:top-3 before:h-[calc(100%-1.5rem)] before:w-px before:bg-[oklch(86%_0.06_250)]">
                      {gitCommits.map((commit, index) => (
                        <li key={commit.hash} className="relative">
                          <span className="absolute -left-7 top-3 z-10 inline-flex size-6 items-center justify-center rounded-full bg-[oklch(96%_0.055_245)] text-[oklch(48%_0.16_255)] ring-2 ring-[oklch(99%_0.006_245)]">
                            <svg
                              className="size-3.5"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth={2.2}
                              aria-hidden
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M7 8a4 4 0 0 1 8 0v8a4 4 0 1 1-4-4h6"
                              />
                            </svg>
                          </span>
                          <div className="rounded-lg border border-[oklch(88%_0.035_255)] bg-[oklch(99%_0.006_245)] px-3 py-3 shadow-sm">
                            <div className="flex flex-wrap items-start gap-2">
                              {index === 0 && (
                                <span className="rounded-md bg-[oklch(90%_0.08_145)] px-2 py-0.5 text-[10px] font-semibold text-[oklch(37%_0.13_150)]">
                                  Latest
                                </span>
                              )}
                              <span className="min-w-0 flex-1 font-semibold leading-5 text-[oklch(28%_0.07_260)]">
                                {commit.subject}
                              </span>
                            </div>
                            <span className="mt-2 block font-mono text-xs font-bold text-[oklch(47%_0.08_250)]">
                              {commit.hash}
                            </span>
                            <span className="mt-1 block text-xs font-semibold text-[oklch(44%_0.07_250)]">
                              {formatCommitDate(commit.date)}
                            </span>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <p className="text-sm font-medium text-[oklch(50%_0.07_260)]">
                    No recent commits found.
                  </p>
                )}
              </div>
            </aside>
          </div>
        </>
      )}
    </div>
  );
}
