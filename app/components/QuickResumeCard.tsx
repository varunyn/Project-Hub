"use client";

import Link from "next/link";
import type { Project } from "../types";
import { formatLastActivity, getStatusColor } from "../utils/format";

interface QuickResumeCardProps {
  project: Project;
  onEdit?: (project: Project) => void;
  onDelete?: (project: Project) => void;
}

export default function QuickResumeCard({ project, onEdit, onDelete }: QuickResumeCardProps) {
  const snippet = project.readmePreview
    ? project.readmePreview.slice(0, 80).trim() + (project.readmePreview.length > 80 ? "…" : "")
    : "No description";

  return (
    <div className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-sm ring-1 ring-slate-900/5 transition-all hover:border-slate-300 hover:shadow-md focus-within:ring-2 focus-within:ring-blue-500 focus-within:ring-offset-2 flex flex-col gap-2">
      <Link href={`/projects/${project.id}`} className="block focus:outline-none focus:ring-0">
        <div className="flex justify-between items-start gap-2">
          <h3 className="font-semibold text-slate-900 truncate">{project.name}</h3>
          <span
            className={`shrink-0 inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${getStatusColor(
              project.status,
            )}`}
          >
            {project.status.replace(/-/g, " ")}
          </span>
        </div>
        <p className="text-sm text-slate-600 mt-1 line-clamp-2">{snippet}</p>
        <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
          <span>{formatLastActivity(project.lastUpdated)}</span>
          {project.docCount != null && <span>{project.docCount} docs</span>}
        </div>
        {project.techStack.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {project.techStack.slice(0, 4).map((tech) => (
              <span
                key={tech}
                className="rounded-lg bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700 ring-1 ring-slate-200/60"
              >
                {tech}
              </span>
            ))}
          </div>
        )}
      </Link>
      {(onEdit || onDelete) && (
        <div className="flex items-center gap-2 pt-1 border-t border-slate-100">
          {onEdit && (
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                onEdit(project);
              }}
              className="text-xs text-slate-500 hover:text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-300 rounded transition-colors"
              aria-label={`Edit ${project.name}`}
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
              className="text-xs text-red-600 hover:text-red-700 focus:outline-none focus:ring-2 focus:ring-red-200 rounded transition-colors"
              aria-label={`Delete ${project.name}`}
            >
              Delete
            </button>
          )}
        </div>
      )}
    </div>
  );
}
