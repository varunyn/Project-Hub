"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useMemo, useState } from "react";
import ProjectForm from "../components/ProjectForm";
import QuickResumeCard from "../components/QuickResumeCard";
import SearchBar from "../components/SearchBar";
import { useProjects } from "../hooks/useProjects";
import type { Project } from "../types";
import { formatLastActivity, getStatusColor } from "../utils/format";

function useFiltersFromUrl() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const searchQuery = searchParams.get("q") ?? "";
  const techFilter = searchParams.get("tech") ?? null;
  const statusFilter = searchParams.get("status") ?? null;
  const projectTypeFilter = searchParams.get("type") ?? null;
  const tagFilter = searchParams.get("tag") ?? null;

  const setSearchQuery = useCallback(
    (q: string) => {
      const p = new URLSearchParams(searchParams.toString());
      if (q) p.set("q", q);
      else p.delete("q");
      router.replace(`${pathname}?${p.toString()}`);
    },
    [pathname, router, searchParams]
  );

  const setTechFilter = useCallback(
    (tech: string | null) => {
      const p = new URLSearchParams(searchParams.toString());
      if (tech) p.set("tech", tech);
      else p.delete("tech");
      router.replace(`${pathname}?${p.toString()}`);
    },
    [pathname, router, searchParams]
  );

  const setStatusFilter = useCallback(
    (status: string | null) => {
      const p = new URLSearchParams(searchParams.toString());
      if (status) p.set("status", status);
      else p.delete("status");
      router.replace(`${pathname}?${p.toString()}`);
    },
    [pathname, router, searchParams]
  );

  const setProjectTypeFilter = useCallback(
    (type: string | null) => {
      const p = new URLSearchParams(searchParams.toString());
      if (type) p.set("type", type);
      else p.delete("type");
      router.replace(`${pathname}?${p.toString()}`);
    },
    [pathname, router, searchParams]
  );

  const setTagFilter = useCallback(
    (tag: string | null) => {
      const p = new URLSearchParams(searchParams.toString());
      if (tag) p.set("tag", tag);
      else p.delete("tag");
      router.replace(`${pathname}?${p.toString()}`);
    },
    [pathname, router, searchParams]
  );

  return {
    searchQuery,
    techFilter,
    statusFilter,
    projectTypeFilter,
    tagFilter,
    setSearchQuery,
    setTechFilter,
    setStatusFilter,
    setProjectTypeFilter,
    setTagFilter,
  };
}

function HomeContent() {
  const router = useRouter();
  const {
    projects,
    loading,
    scanning,
    scanMessage,
    error,
    addProject,
    updateProject,
    deleteProject,
    clearError,
    scanProjects,
    rescanProjects,
  } = useProjects();

  const {
    searchQuery,
    techFilter,
    statusFilter,
    projectTypeFilter,
    tagFilter,
    setSearchQuery,
    setTechFilter,
    setStatusFilter,
    setProjectTypeFilter,
    setTagFilter,
  } = useFiltersFromUrl();

  const [showForm, setShowForm] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [renderedAt] = useState(() => Date.now());
  type SortKey = "status" | "lastActivity";
  const [sortBy, setSortBy] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const allTechStacks = useMemo(() => {
    const techSet = new Set<string>();
    for (const project of projects) {
      for (const tech of project.techStack) techSet.add(tech);
    }
    return Array.from(techSet).sort();
  }, [projects]);

  const allProjectTypes = useMemo(() => {
    const set = new Set<string>();
    projects.forEach((p) => {
      if (p.projectType) set.add(p.projectType);
    });
    return Array.from(set).sort();
  }, [projects]);

  const allTags = useMemo(() => {
    const set = new Set<string>();
    for (const p of projects) {
      for (const t of p.tags ?? []) set.add(t);
    }
    return Array.from(set).sort();
  }, [projects]);

  const filteredProjects = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    const result: Project[] = [];
    for (const p of projects) {
      if (searchQuery && !p.name.toLowerCase().includes(q) && !p.path?.toLowerCase().includes(q))
        continue;
      if (techFilter && !p.techStack.includes(techFilter)) continue;
      if (statusFilter && p.status !== statusFilter) continue;
      if (projectTypeFilter && p.projectType !== projectTypeFilter) continue;
      if (tagFilter && !(p.tags ?? []).includes(tagFilter)) continue;
      result.push(p);
    }
    return result;
  }, [projects, searchQuery, techFilter, statusFilter, projectTypeFilter, tagFilter]);

  const sortedProjects = useMemo(() => {
    if (!sortBy) return filteredProjects;
    if (sortBy === "status") {
      return [...filteredProjects].sort((a, b) => {
        const order = (s: string) => (s === "in progress" ? 0 : s === "completed" ? 1 : 2);
        const cmp = order(a.status) - order(b.status);
        return sortDir === "asc" ? cmp : -cmp;
      });
    }
    return [...filteredProjects].sort((a, b) => {
      const ta = new Date(a.lastUpdated).getTime();
      const tb = new Date(b.lastUpdated).getTime();
      const cmp = ta - tb;
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [filteredProjects, sortBy, sortDir]);

  const quickResumeProjects = useMemo(
    () =>
      [...projects]
        .sort((a, b) => new Date(b.lastUpdated).getTime() - new Date(a.lastUpdated).getTime())
        .slice(0, 12),
    [projects]
  );

  const activeThisWeekCount = useMemo(() => {
    const weekAgo = new Date(renderedAt - 7 * 24 * 60 * 60 * 1000);
    return projects.filter((project) => new Date(project.lastUpdated) >= weekAgo).length;
  }, [projects, renderedAt]);

  const pinnedCount = useMemo(
    () => projects.filter((project) => project.pinned).length,
    [projects]
  );

  const completedCount = useMemo(
    () => projects.filter((project) => project.status === "completed").length,
    [projects]
  );

  const handleAddProject = useCallback(
    async (projectData: Partial<Project>) => {
      await addProject(projectData);
      setShowForm(false);
    },
    [addProject]
  );

  const handleUpdateProject = useCallback(
    async (projectData: Partial<Project>) => {
      if (!editingProject?.id) return;
      await updateProject(editingProject.id, projectData);
      setEditingProject(null);
      setShowForm(false);
    },
    [editingProject, updateProject]
  );

  const handleEditProject = useCallback(
    (project: Project) => {
      router.push(`/projects/${project.id}?edit=1`);
    },
    [router]
  );

  const handleDeleteProject = useCallback(
    async (project: Project) => {
      if (!confirm(`Delete quest "${project.name}"? This cannot be undone.`)) return;
      await deleteProject(project.id);
    },
    [deleteProject]
  );

  const handleFormSubmit = useCallback(
    (projectData: Partial<Project>) => {
      if (editingProject) {
        handleUpdateProject(projectData);
      } else {
        handleAddProject(projectData);
      }
    },
    [editingProject, handleAddProject, handleUpdateProject]
  );

  const handleFormCancel = useCallback(() => {
    setShowForm(false);
    setEditingProject(null);
  }, []);

  const handleTogglePin = useCallback(
    async (project: Project) => {
      await updateProject(project.id, { pinned: !project.pinned });
    },
    [updateProject]
  );

  const handleSort = useCallback((key: SortKey) => {
    setSortBy((prev) => {
      if (prev === key) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
        return key;
      }
      setSortDir(key === "lastActivity" ? "desc" : "asc");
      return key;
    });
  }, []);

  const handleScanProjects = useCallback(async () => {
    await scanProjects();
  }, [scanProjects]);

  const handleRescanProjects = useCallback(async () => {
    await rescanProjects();
  }, [rescanProjects]);

  return (
    <div className="mx-auto max-w-7xl">
      <div className="mb-6 rounded-lg border border-slate-200 bg-white px-5 py-4 shadow-sm ring-1 ring-slate-950/[0.03] sm:px-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Quest Hub
            </p>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-950">
              Quest Dashboard
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              {loading
                ? "Loading quest inventory"
                : `${filteredProjects.length} of ${projects.length} quests shown`}
            </p>
          </div>
          <div className="flex w-full flex-wrap gap-2 sm:w-auto">
            {!showForm && (
              <>
                <button
                  type="button"
                  onClick={handleScanProjects}
                  disabled={scanning}
                  className="inline-flex min-h-11 items-center justify-center rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-300 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {scanning ? "Scanning" : "Scan quests"}
                </button>
                <button
                  type="button"
                  onClick={handleRescanProjects}
                  disabled={scanning || projects.length === 0}
                  className="inline-flex min-h-11 items-center justify-center rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-300 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {scanning ? "Scanning" : "Rescan existing"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowForm(true)}
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-500 focus:ring-offset-2"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-5 w-5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    aria-hidden
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 4v16m8-8H4"
                    />
                  </svg>
                  Add quest
                </button>
              </>
            )}
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3 border-t border-slate-100 pt-4 sm:grid-cols-4">
          {[
            ["Total", projects.length],
            ["Active this week", activeThisWeekCount],
            ["Pinned", pinnedCount],
            ["Completed", completedCount],
          ].map(([label, value]) => (
            <div key={label} className="min-w-0">
              <p className="text-xs font-medium text-slate-500">{label}</p>
              <p className="mt-1 text-xl font-semibold tabular-nums text-slate-950">{value}</p>
            </div>
          ))}
        </div>
      </div>

      {scanMessage && (
        <p className="mb-4 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
          {scanMessage}
        </p>
      )}

      {error && (
        <div className="mb-6 flex items-center justify-between rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <span>{error}</span>
          <button
            type="button"
            onClick={clearError}
            className="inline-flex min-h-8 min-w-8 items-center justify-center rounded p-1 font-medium hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-red-300"
            aria-label="Dismiss error"
          >
            ×
          </button>
        </div>
      )}

      {showForm ? (
        <ProjectForm
          key={editingProject?.id ?? "new"}
          project={editingProject ?? undefined}
          onSubmit={handleFormSubmit}
          onCancel={handleFormCancel}
        />
      ) : (
        <>
          {projects.length > 0 && (
            <>
              {quickResumeProjects.length > 0 && (
                <section className="mb-8">
                  <div className="mb-3 flex items-end justify-between gap-3">
                    <div>
                      <h2 className="text-base font-semibold tracking-tight text-slate-950">
                        Quick Resume
                      </h2>
                      <p className="mt-0.5 text-sm text-slate-500">12 most recent quests</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {quickResumeProjects.map((project) => (
                      <QuickResumeCard
                        key={project.id}
                        project={project}
                        onEdit={handleEditProject}
                        onDelete={handleDeleteProject}
                      />
                    ))}
                  </div>
                </section>
              )}
              <SearchBar
                searchQuery={searchQuery}
                onSearch={setSearchQuery}
                techFilter={techFilter}
                onFilterByTech={setTechFilter}
                statusFilter={statusFilter}
                onFilterByStatus={setStatusFilter}
                allTechStacks={allTechStacks}
                projectTypeFilter={projectTypeFilter}
                onFilterByProjectType={setProjectTypeFilter}
                allProjectTypes={allProjectTypes}
                tagFilter={tagFilter}
                onFilterByTag={setTagFilter}
                allTags={allTags}
              />
            </>
          )}

          {loading ? (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {["first", "second", "third", "fourth", "fifth", "sixth"].map((slot) => (
                <div
                  key={slot}
                  className="h-44 animate-pulse rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
                >
                  <div className="h-4 w-2/3 rounded bg-slate-200" />
                  <div className="mt-4 h-3 w-full rounded bg-slate-100" />
                  <div className="mt-2 h-3 w-5/6 rounded bg-slate-100" />
                  <div className="mt-6 h-3 w-1/3 rounded bg-slate-100" />
                </div>
              ))}
            </div>
          ) : projects.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-300 bg-white p-10 text-center shadow-sm">
              <h2 className="mb-2 text-lg font-semibold tracking-tight text-slate-950">
                No quests yet
              </h2>
              <p className="mx-auto mb-5 max-w-md text-sm leading-6 text-slate-500">
                Add a quest manually, or scan your workspace to build the dashboard.
              </p>
              <button
                type="button"
                onClick={() => setShowForm(true)}
                className="inline-flex min-h-11 items-center justify-center rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-500 focus:ring-offset-2"
              >
                Add quest
              </button>
            </div>
          ) : filteredProjects.length === 0 ? (
            <div className="rounded-lg border border-slate-200 bg-white p-10 text-center shadow-sm">
              <h2 className="mb-2 text-lg font-semibold text-slate-950">No matching quests</h2>
              <p className="mb-5 text-sm text-slate-500">Try a broader search or clear filters.</p>
              <button
                type="button"
                onClick={() => {
                  setSearchQuery("");
                  setTechFilter(null);
                  setStatusFilter(null);
                  setProjectTypeFilter(null);
                  setTagFilter(null);
                }}
                className="inline-flex min-h-10 items-center justify-center rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-300 focus:ring-offset-2"
              >
                Clear filters
              </button>
            </div>
          ) : (
            <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm ring-1 ring-slate-950/[0.03]">
              <div className="overflow-x-auto">
                <table className="min-w-[760px] w-full text-left">
                  <thead className="border-b border-slate-200 bg-slate-50/80">
                    <tr>
                      <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-600 w-10">
                        Pin
                      </th>
                      <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-600">
                        Quest
                      </th>
                      <th
                        className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-600 w-32"
                        aria-sort={
                          sortBy === "status"
                            ? sortDir === "asc"
                              ? "ascending"
                              : "descending"
                            : undefined
                        }
                      >
                        <button
                          type="button"
                          onClick={() => handleSort("status")}
                          className="inline-flex items-center gap-1 font-semibold text-slate-600 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-300 rounded transition-colors"
                        >
                          Status
                          {sortBy === "status" && (
                            <span aria-hidden>{sortDir === "asc" ? "↑" : "↓"}</span>
                          )}
                        </button>
                      </th>
                      <th
                        className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-600 w-36"
                        aria-sort={
                          sortBy === "lastActivity"
                            ? sortDir === "asc"
                              ? "ascending"
                              : "descending"
                            : undefined
                        }
                      >
                        <button
                          type="button"
                          onClick={() => handleSort("lastActivity")}
                          className="inline-flex items-center gap-1 font-semibold text-slate-600 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-300 rounded transition-colors"
                        >
                          Last Activity
                          {sortBy === "lastActivity" && (
                            <span aria-hidden>{sortDir === "asc" ? "↑" : "↓"}</span>
                          )}
                        </button>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedProjects.map((project) => (
                      <tr
                        key={project.id}
                        className="border-b border-slate-100 transition-colors last:border-0 hover:bg-slate-50/70"
                      >
                        <td className="px-4 py-3">
                          <button
                            type="button"
                            onClick={() => handleTogglePin(project)}
                            className="inline-flex size-9 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-400/50"
                            aria-label={project.pinned ? "Unpin" : "Pin"}
                            title={project.pinned ? "Unpin" : "Pin"}
                          >
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              className={`h-4 w-4 ${project.pinned ? "fill-amber-500 text-amber-500" : ""}`}
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
                          </button>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex min-w-0 flex-wrap items-center gap-2">
                            <Link
                              href={`/projects/${project.id}`}
                              className="max-w-[20rem] truncate rounded font-medium text-blue-700 transition-colors hover:text-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-1"
                            >
                              {project.name}
                            </Link>
                            <button
                              type="button"
                              onClick={() => handleEditProject(project)}
                              className="rounded-md px-2 py-1 text-xs font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-300"
                              aria-label={`Edit quest ${project.name}`}
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteProject(project)}
                              className="rounded-md px-2 py-1 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 hover:text-red-700 focus:outline-none focus:ring-2 focus:ring-red-200"
                              aria-label={`Delete quest ${project.name}`}
                            >
                              Delete
                            </button>
                          </div>
                          {project.path && (
                            <p className="text-xs text-slate-500 truncate max-w-md mt-0.5">
                              {project.path}
                            </p>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${getStatusColor(
                              project.status
                            )}`}
                          >
                            {project.status.replace(/-/g, " ")}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-600">
                          {formatLastActivity(project.lastUpdated)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function Home() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-[50vh]">
          <div className="animate-spin rounded-full h-10 w-10 border-2 border-slate-200 border-t-blue-500" />
        </div>
      }
    >
      <HomeContent />
    </Suspense>
  );
}
