"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { TASK_COLUMNS } from "../lib/taskConstants";
import { fetchProjectTasks } from "../lib/tasksApi";
import type { ProjectTask } from "../types";

function OverviewTaskSummary({ projectId }: { projectId: string }) {
  const [tasks, setTasks] = useState<ProjectTask[]>([]);
  useEffect(() => {
    fetchProjectTasks(projectId)
      .then(setTasks)
      .catch(() => setTasks([]));
  }, [projectId]);
  const openTasks = tasks.filter((task) => task.status !== "done");
  const blockedTasks = tasks.filter((task) =>
    task.labels.some((label) => label.toLowerCase() === "blocked")
  );
  const statusProgress = TASK_COLUMNS.map((column) => ({
    ...column,
    count: tasks.filter((task) => task.status === column.id).length,
  }));

  return (
    <section
      className="mb-4 rounded-lg border border-[oklch(88%_0.03_255)] bg-[oklch(99%_0.006_245)] p-4 shadow-[0_1px_2px_oklch(25%_0.04_260_/_0.08)]"
      aria-labelledby="task-summary-heading"
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-[oklch(45%_0.13_205)]">
            Project pulse
          </p>
          <h2 id="task-summary-heading" className="mt-1 text-base font-semibold text-slate-900">
            Task summary
          </h2>
        </div>
        <Link
          href={`/projects/${projectId}?tab=tasks`}
          className="text-sm font-semibold text-[oklch(39%_0.1_230)] hover:underline"
        >
          View all tasks →
        </Link>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg bg-[oklch(97%_0.018_245)] px-3 py-2.5">
          <p className="text-xs font-semibold text-slate-500">Open tasks</p>
          <p className="mt-1 text-xl font-semibold text-slate-900">{openTasks.length}</p>
        </div>
        <div className="rounded-lg bg-[oklch(97%_0.018_245)] px-3 py-2.5">
          <p className="text-xs font-semibold text-slate-500">Recently updated</p>
          <p className="mt-1 truncate text-sm font-semibold text-slate-800">
            {[...tasks].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]?.title ??
              "No tasks yet"}
          </p>
        </div>
        <div
          className={`rounded-lg px-3 py-2.5 ${blockedTasks.length ? "bg-[oklch(97%_0.035_25)]" : "bg-[oklch(97%_0.035_145)]"}`}
        >
          <p className="text-xs font-semibold text-slate-500">Blocked items</p>
          <p
            className={`mt-1 text-xl font-semibold ${blockedTasks.length ? "text-rose-800" : "text-emerald-800"}`}
          >
            {blockedTasks.length}
          </p>
        </div>
      </div>
      <div className="mt-4">
        <div className="mb-2 flex items-center justify-between text-xs font-semibold text-slate-500">
          <span>Progress by status</span>
          <span>
            {tasks.filter((task) => task.status === "done").length} of {tasks.length} done
          </span>
        </div>
        <div className="flex h-2 overflow-hidden rounded-full bg-slate-100">
          {statusProgress.map((column) => (
            <span
              key={column.id}
              className={column.tone}
              style={{ width: tasks.length ? `${(column.count / tasks.length) * 100}%` : "0%" }}
              title={`${column.label}: ${column.count}`}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

export default OverviewTaskSummary;
