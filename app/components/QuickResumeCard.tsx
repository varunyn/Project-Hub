"use client";

import Link from "next/link";
import { memo } from "react";
import type { Project } from "../types";
import { formatLastActivity, getStatusColor } from "../utils/format";

interface QuickResumeCardProps {
  project: Project;
  onEdit?: (project: Project) => void;
  onDelete?: (project: Project) => void;
}

function QuickResumeCard({ project, onEdit, onDelete }: QuickResumeCardProps) {
  const snippet = project.readmePreview
    ? project.readmePreview.slice(0, 80).trim() + (project.readmePreview.length > 80 ? "…" : "")
    : "No description";

  return (
    <div className="group flex min-h-44 flex-col rounded-lg border border-slate-200 bg-white p-4 shadow-sm ring-1 ring-slate-950/[0.03] transition-[border-color,box-shadow,transform] duration-200 ease-out [contain-intrinsic-size:176px] [content-visibility:auto] hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md focus-within:ring-2 focus-within:ring-blue-500/70 focus-within:ring-offset-2">
      <Link
        href={`/projects/${project.id}`}
        className="block flex-1 rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/70 focus-visible:ring-offset-2"
      >
        <div className="flex items-start justify-between gap-3">
          <h3 className="min-w-0 truncate text-[15px] font-semibold leading-6 text-slate-950">
            {project.name}
          </h3>
          <span
            className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-[11px] font-semibold capitalize ${getStatusColor(
              project.status,
            )}`}
          >
            {project.status.replace(/-/g, " ")}
          </span>
        </div>
        <p className="mt-1.5 line-clamp-2 text-sm leading-5 text-slate-600">{snippet}</p>
        <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
          <span>{formatLastActivity(project.lastUpdated)}</span>
          {project.docCount != null && <span>{project.docCount} docs</span>}
        </div>
        {project.techStack.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {project.techStack.slice(0, 4).map((tech) => (
              <span
                key={tech}
                className="rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700 ring-1 ring-slate-200/70"
              >
                {tech}
              </span>
            ))}
          </div>
        )}
      </Link>
      {(onEdit || onDelete) && (
        <div className="mt-3 flex items-center gap-1.5 border-t border-slate-100 pt-3">
          {onEdit && (
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                onEdit(project);
              }}
              className="rounded-md px-2 py-1 text-xs font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-300"
              aria-label={`Edit quest ${project.name}`}
            >
              Edit
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                onDelete(project);
              }}
              className="rounded-md px-2 py-1 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 hover:text-red-700 focus:outline-none focus:ring-2 focus:ring-red-200"
              aria-label={`Delete quest ${project.name}`}
            >
              Delete
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default memo(QuickResumeCard);
