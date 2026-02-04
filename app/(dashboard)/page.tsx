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

  const setSearchQuery = useCallback(
    (q: string) => {
      const p = new URLSearchParams(searchParams.toString());
      if (q) p.set("q", q);
      else p.delete("q");
      router.replace(`${pathname}?${p.toString()}`);
    },
    [pathname, router, searchParams],
  );

  const setTechFilter = useCallback(
    (tech: string | null) => {
      const p = new URLSearchParams(searchParams.toString());
      if (tech) p.set("tech", tech);
      else p.delete("tech");
      router.replace(`${pathname}?${p.toString()}`);
    },
    [pathname, router, searchParams],
  );

  const setStatusFilter = useCallback(
    (status: string | null) => {
      const p = new URLSearchParams(searchParams.toString());
      if (status) p.set("status", status);
      else p.delete("status");
      router.replace(`${pathname}?${p.toString()}`);
    },
    [pathname, router, searchParams],
  );

  const setProjectTypeFilter = useCallback(
    (type: string | null) => {
      const p = new URLSearchParams(searchParams.toString());
      if (type) p.set("type", type);
      else p.delete("type");
      router.replace(`${pathname}?${p.toString()}`);
    },
    [pathname, router, searchParams],
  );

  return {
    searchQuery,
    techFilter,
    statusFilter,
    projectTypeFilter,
    setSearchQuery,
    setTechFilter,
    setStatusFilter,
    setProjectTypeFilter,
  };
}

function HomeContent() {
  const {
    projects,
    loading,
    error,
    addProject,
    updateProject,
    deleteProject,
    clearError,
    refetch,
  } = useProjects();

  const {
    searchQuery,
    techFilter,
    statusFilter,
    projectTypeFilter,
    setSearchQuery,
    setTechFilter,
    setStatusFilter,
    setProjectTypeFilter,
  } = useFiltersFromUrl();

  const [showForm, setShowForm] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  type SortKey = "status" | "lastActivity";
  const [sortBy, setSortBy] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const allTechStacks = useMemo(() => {
    const techSet = new Set<string>();
    for (const project of projects) {
      for (const tech of project.techStack) techSet.add(tech);
    }
    return Array.from(techSet).toSorted();
  }, [projects]);

  const allProjectTypes = useMemo(() => {
    const set = new Set<string>();
    projects.forEach((p) => {
      if (p.projectType) set.add(p.projectType);
    });
    return Array.from(set).toSorted();
  }, [projects]);

  const filteredProjects = useMemo(() => {
    let result = [...projects];
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (p) => p.name.toLowerCase().includes(q) || p.path?.toLowerCase().includes(q),
      );
    }
    if (techFilter) {
      result = result.filter((p) => p.techStack.includes(techFilter));
    }
    if (statusFilter) {
      result = result.filter((p) => p.status === statusFilter);
    }
    if (projectTypeFilter) {
      result = result.filter((p) => p.projectType === projectTypeFilter);
    }
    return result;
  }, [projects, searchQuery, techFilter, statusFilter, projectTypeFilter]);

  const sortedProjects = useMemo(() => {
    if (!sortBy) return filteredProjects;
    if (sortBy === "status") {
      return filteredProjects.toSorted((a, b) => {
        const order = (s: string) => (s === "in progress" ? 0 : s === "completed" ? 1 : 2);
        const cmp = order(a.status) - order(b.status);
        return sortDir === "asc" ? cmp : -cmp;
      });
    }
    return filteredProjects.toSorted((a, b) => {
      const ta = new Date(a.lastUpdated).getTime();
      const tb = new Date(b.lastUpdated).getTime();
      const cmp = ta - tb;
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [filteredProjects, sortBy, sortDir]);

  const quickResumeProjects = useMemo(() => {
    return projects
      .toSorted((a, b) => new Date(b.lastUpdated).getTime() - new Date(a.lastUpdated).getTime())
      .slice(0, 12);
  }, [projects]);

  const handleAddProject = useCallback(
    async (projectData: Partial<Project>) => {
      await addProject(projectData);
      setShowForm(false);
    },
    [addProject],
  );

  const handleUpdateProject = useCallback(
    async (projectData: Partial<Project>) => {
      if (!editingProject?.id) return;
      await updateProject(editingProject.id, projectData);
      setEditingProject(null);
      setShowForm(false);
    },
    [editingProject, updateProject],
  );

  const handleEditProject = useCallback((project: Project) => {
    setEditingProject(project);
    setShowForm(true);
  }, []);

  const handleDeleteProject = useCallback(
    async (project: Project) => {
      if (!confirm(`Delete "${project.name}"? This cannot be undone.`)) return;
      try {
        await deleteProject(project.id);
      } catch {}
    },
    [deleteProject],
  );

  const handleFormSubmit = useCallback(
    (projectData: Partial<Project>) => {
      if (editingProject) {
        handleUpdateProject(projectData);
      } else {
        handleAddProject(projectData);
      }
    },
    [editingProject, handleAddProject, handleUpdateProject],
  );

  const handleFormCancel = useCallback(() => {
    setShowForm(false);
    setEditingProject(null);
  }, []);

  const handleTogglePin = useCallback(
    async (project: Project) => {
      await updateProject(project.id, { pinned: !project.pinned });
    },
    [updateProject],
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

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex flex-wrap justify-between items-center gap-4 mb-6">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900">Project Dashboard</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {loading ? "…" : `${filteredProjects.length} projects found`}
          </p>
        </div>
        <div className="flex gap-2">
          {!showForm && (
            <>
              <button
                type="button"
                onClick={() => refetch()}
                className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-300 focus:ring-offset-2 transition-colors"
              >
                Scan Projects
              </button>
              <button
                type="button"
                onClick={() => setShowForm(true)}
                className="inline-flex items-center gap-2 rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-500 focus:ring-offset-2 transition-colors"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-5 w-5 mr-1"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 4v16m8-8H4"
                  />
                </svg>
                Add Project
              </button>
            </>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-red-700 text-sm mb-6 flex justify-between items-center">
          <span>{error}</span>
          <button
            type="button"
            onClick={clearError}
            className="rounded p-1 font-medium hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-red-300"
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
                  <h2 className="text-base font-semibold text-slate-900 tracking-tight mb-3 flex items-center gap-2">
                    <span aria-hidden>⚡</span>
                    Quick Resume (12 most recent)
                  </h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
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
              />
            </>
          )}

          {loading ? (
            <div className="flex justify-center items-center h-64">
              <div className="animate-spin rounded-full h-10 w-10 border-2 border-slate-200 border-t-blue-500" />
            </div>
          ) : projects.length === 0 ? (
            <div className="rounded-xl border border-slate-200/80 bg-white p-8 text-center shadow-sm ring-1 ring-slate-900/5">
              <h2 className="text-lg font-semibold tracking-tight text-slate-900 mb-2">
                No Projects Yet
              </h2>
              <p className="text-slate-500 mb-4 text-sm">
                Start by adding your first project using the button above.
              </p>
            </div>
          ) : filteredProjects.length === 0 ? (
            <div className="rounded-xl border border-slate-200/80 bg-white p-8 text-center shadow-sm ring-1 ring-slate-900/5">
              <h2 className="text-lg font-semibold text-slate-900 mb-2">No Matching Projects</h2>
              <p className="text-slate-500 mb-4 text-sm">Try adjusting your search criteria.</p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-sm ring-1 ring-slate-900/5">
              <table className="w-full text-left">
                <thead className="border-b border-slate-200 bg-slate-50/80">
                  <tr>
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-600 w-10">
                      Pin
                    </th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-600">
                      Project
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
                      className="border-b border-slate-100 last:border-0 hover:bg-slate-50/50 transition-colors"
                    >
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => handleTogglePin(project)}
                          className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-400/50 transition-colors"
                          aria-label={project.pinned ? "Unpin" : "Pin"}
                          title={project.pinned ? "Unpin" : "Pin"}
                        >
                          <span className={project.pinned ? "text-amber-500" : ""}>
                            {project.pinned ? "🔖" : "📌"}
                          </span>
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Link
                            href={`/projects/${project.id}`}
                            className="font-medium text-blue-600 hover:text-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-1 rounded transition-colors"
                          >
                            {project.name}
                          </Link>
                          <button
                            type="button"
                            onClick={() => handleEditProject(project)}
                            className="text-xs text-slate-500 hover:text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-300 rounded transition-colors"
                            aria-label={`Edit ${project.name}`}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteProject(project)}
                            className="text-xs text-red-600 hover:text-red-700 focus:outline-none focus:ring-2 focus:ring-red-200 rounded transition-colors"
                            aria-label={`Delete ${project.name}`}
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
                            project.status,
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
