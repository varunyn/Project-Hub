"use client";

import { useEffect, useRef, useState } from "react";

interface SearchBarProps {
  searchQuery: string;
  onSearch: (query: string) => void;
  techFilter: string | null;
  onFilterByTech: (tech: string | null) => void;
  statusFilter: string | null;
  onFilterByStatus: (status: string | null) => void;
  allTechStacks: string[];
  projectTypeFilter?: string | null;
  onFilterByProjectType?: (type: string | null) => void;
  allProjectTypes?: string[];
}

export default function SearchBar({
  searchQuery,
  onSearch,
  techFilter,
  onFilterByTech,
  statusFilter,
  onFilterByStatus,
  allTechStacks,
  projectTypeFilter = null,
  onFilterByProjectType,
  allProjectTypes = [],
}: SearchBarProps) {
  const [techPopoverOpen, setTechPopoverOpen] = useState(false);
  const [techSearch, setTechSearch] = useState("");
  const techPopoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!techPopoverOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (techPopoverRef.current && !techPopoverRef.current.contains(e.target as Node)) {
        setTechPopoverOpen(false);
        setTechSearch("");
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [techPopoverOpen]);

  const filteredTechs = allTechStacks.filter((tech) =>
    tech.toLowerCase().includes(techSearch.toLowerCase().trim()),
  );

  const handleTechSelect = (tech: string | null) => {
    onFilterByTech(tech);
    setTechPopoverOpen(false);
    setTechSearch("");
  };

  const handleStatusChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const status = e.target.value === "all" ? null : e.target.value;
    onFilterByStatus(status);
  };

  const handleReset = () => {
    setTechSearch("");
    setTechPopoverOpen(false);
    onSearch("");
    onFilterByTech(null);
    onFilterByStatus(null);
    onFilterByProjectType?.(null);
  };

  const techDisplayLabel = techFilter ?? "All Technologies";

  return (
    <div className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-sm ring-1 ring-slate-900/5 mb-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-end">
        <div className="flex-grow min-w-0">
          <label htmlFor="search" className="block text-sm font-medium text-slate-700 mb-1">
            Search by name
          </label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-5 w-5 text-slate-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
            </div>
            <input
              type="text"
              id="search"
              className="w-full rounded-lg border border-slate-200 bg-white pl-10 pr-3 py-2 text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-colors"
              placeholder="Search projects by name, path, or commit message..."
              value={searchQuery}
              onChange={(e) => onSearch(e.target.value)}
            />
          </div>
        </div>

        <div className="w-full md:w-52 shrink-0" ref={techPopoverRef}>
          <label
            id="tech-filter-label"
            htmlFor="tech-filter-button"
            className="block text-sm font-medium text-slate-700 mb-1"
          >
            Tech stack
          </label>
          <div className="relative">
            <button
              id="tech-filter-button"
              type="button"
              onClick={() => setTechPopoverOpen((v) => !v)}
              aria-haspopup="listbox"
              aria-expanded={techPopoverOpen}
              aria-labelledby="tech-filter-label"
              className="w-full flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-slate-900 hover:border-slate-300 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-colors"
            >
              <span className="truncate">
                {techFilter ? (
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-sm font-medium bg-blue-100 text-blue-800">
                    {techDisplayLabel}
                  </span>
                ) : (
                  <span className="text-slate-500">{techDisplayLabel}</span>
                )}
              </span>
              <svg
                className={`h-4 w-4 text-slate-400 shrink-0 transition-transform ${techPopoverOpen ? "rotate-180" : ""}`}
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 9l-7 7-7-7"
                />
              </svg>
            </button>

            {techPopoverOpen && (
              <div
                role="listbox"
                aria-labelledby="tech-filter-label"
                className="absolute z-20 mt-1 w-full rounded-lg border border-slate-200 bg-white shadow-lg ring-1 ring-slate-900/5"
              >
                <div className="border-b border-slate-100 p-2">
                  <input
                    type="text"
                    placeholder="Search technologies..."
                    value={techSearch}
                    onChange={(e) => setTechSearch(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Escape") {
                        setTechPopoverOpen(false);
                        setTechSearch("");
                      }
                    }}
                    className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-colors"
                  />
                </div>
                <div className="max-h-56 overflow-y-auto py-1">
                  <button
                    type="button"
                    role="option"
                    aria-selected={!techFilter}
                    onClick={() => handleTechSelect(null)}
                    className={`w-full text-left px-3 py-2 text-sm transition-colors ${!techFilter ? "bg-blue-50 text-blue-700 font-medium" : "text-slate-700 hover:bg-slate-50"}`}
                  >
                    All Technologies
                  </button>
                  {filteredTechs.length === 0 ? (
                    <div className="px-3 py-4 text-sm text-slate-500 text-center">
                      No technologies match &quot;{techSearch}&quot;
                    </div>
                  ) : (
                    filteredTechs.map((tech) => (
                      <button
                        key={tech}
                        type="button"
                        role="option"
                        aria-selected={techFilter === tech}
                        onClick={() => handleTechSelect(tech)}
                        className={`w-full text-left px-3 py-2 text-sm transition-colors ${techFilter === tech ? "bg-blue-50 text-blue-700 font-medium" : "text-slate-700 hover:bg-slate-50"}`}
                      >
                        {tech}
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="w-full md:w-40 shrink-0">
          <label htmlFor="statusFilter" className="block text-sm font-medium text-slate-700 mb-1">
            Status
          </label>
          <select
            id="statusFilter"
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-colors"
            value={statusFilter || "all"}
            onChange={handleStatusChange}
          >
            <option value="all">All</option>
            <option value="in progress">In Progress</option>
            <option value="completed">Completed</option>
            <option value="archived">Archived</option>
          </select>
        </div>

        {allProjectTypes.length > 0 && onFilterByProjectType && (
          <div className="w-full md:w-40 shrink-0">
            <label
              htmlFor="projectTypeFilter"
              className="block text-sm font-medium text-slate-700 mb-1"
            >
              Project Type
            </label>
            <select
              id="projectTypeFilter"
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-colors"
              value={projectTypeFilter || "all"}
              onChange={(e) => {
                const v = e.target.value;
                onFilterByProjectType(v === "all" ? null : v);
              }}
            >
              <option value="all">All</option>
              {allProjectTypes.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
        )}

        <button
          type="button"
          onClick={handleReset}
          className="shrink-0 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 h-10 shadow-sm hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-300 focus:ring-offset-2 transition-colors"
        >
          Reset
        </button>
      </div>
    </div>
  );
}
