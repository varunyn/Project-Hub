"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { TASK_COLUMNS, type ToastState, type ToastTone } from "../lib/taskConstants";
import {
  createGithubIssueForTask,
  createProjectTask,
  deleteProjectTask,
  fetchProjectTasks,
  importGithubIssues,
  updateProjectTask,
} from "../lib/tasksApi";
import type { ProjectTask, TaskPriority, TaskStatus } from "../types";

function TaskWorkspace({
  projectId,
  projectName,
  githubUrl,
  onConnectGithub,
}: {
  projectId: string;
  projectName: string;
  githubUrl?: string;
  onConnectGithub: () => void;
}) {
  const [tasks, setTasks] = useState<ProjectTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [view, setView] = useState<"board" | "list">("board");
  const [query, setQuery] = useState("");
  const [priorityFilter, setPriorityFilter] = useState<"all" | TaskPriority>("all");
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [syncingGithub, setSyncingGithub] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refreshTasks = useCallback(async () => {
    setLoading(true);
    try {
      setTasks(await fetchProjectTasks(projectId));
      setError(null);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to load tasks");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    refreshTasks().catch(() => undefined);
  }, [refreshTasks]);

  const announce = useCallback((message: string, tone: ToastTone) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ message, tone });
    toastTimerRef.current = setTimeout(() => setToast(null), 4500);
  }, []);

  useEffect(
    () => () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    },
    []
  );

  const visibleTasks = tasks.filter((task) => {
    const matchesQuery = `${task.title} ${task.description} ${task.labels.join(" ")}`
      .toLowerCase()
      .includes(query.toLowerCase());
    return matchesQuery && (priorityFilter === "all" || task.priority === priorityFilter);
  });
  const selectedTask = tasks.find((task) => task.id === selectedTaskId) ?? null;
  const updateTask = async (id: string, changes: Partial<ProjectTask>) => {
    setPending(true);
    try {
      await updateProjectTask(projectId, id, changes);
      await refreshTasks();
      setError(null);
    } catch (requestError) {
      const message =
        requestError instanceof Error ? requestError.message : "Unable to update task";
      setError(message);
      announce(`Task update failed — ${message}`, "danger");
    } finally {
      setPending(false);
    }
  };
  const addTask = async () => {
    const title = draftTitle.trim();
    if (!title) return;
    setPending(true);
    try {
      const task = await createProjectTask(projectId, { title });
      await refreshTasks();
      setSelectedTaskId(task.id);
      setError(null);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to create task");
    } finally {
      setPending(false);
    }
    setDraftTitle("");
  };
  const moveTask = async (status: TaskStatus) => {
    if (!draggedTaskId) return;
    const task = tasks.find((item) => item.id === draggedTaskId);
    if (!task || task.status === status) return;
    const previousTasks = tasks;
    setTasks((current) =>
      current.map((item) => (item.id === task.id ? { ...item, status } : item))
    );
    setDraggedTaskId(null);
    setPending(true);
    try {
      const updated = await updateProjectTask(projectId, task.id, { status });
      setTasks((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      setError(null);
    } catch (requestError) {
      setTasks(previousTasks);
      const message = requestError instanceof Error ? requestError.message : "Unable to move task";
      setError(message);
      announce(`Task move failed — ${message}`, "danger");
    } finally {
      setPending(false);
    }
  };
  const taskCountByStatus = (status: TaskStatus) =>
    tasks.filter((task) => task.status === status).length;
  const priorityStyles: Record<TaskPriority, string> = {
    low: "text-slate-500",
    medium: "text-amber-700",
    high: "text-rose-700",
  };
  const syncGithub = async () => {
    setSyncingGithub(true);
    announce("Checking GitHub for issue updates…", "info");
    try {
      const result = await importGithubIssues(projectId);
      await refreshTasks();
      setError(null);
      if (result.total === 0) {
        announce("GitHub sync complete — no issues found.", "success");
      } else if (result.imported === 0) {
        announce("GitHub is up to date — no new issues found.", "success");
      } else {
        announce(
          `GitHub sync complete — ${result.imported} new issue${result.imported === 1 ? "" : "s"} added.`,
          "success"
        );
      }
    } catch (requestError) {
      const message =
        requestError instanceof Error ? requestError.message : "Unable to sync GitHub issues";
      setError(message);
      announce(`GitHub sync failed — ${message}`, "danger");
    } finally {
      setSyncingGithub(false);
    }
  };

  return (
    <section className="space-y-4" aria-labelledby="tasks-heading">
      {toast && (
        <div
          className={`fixed bottom-5 right-5 z-50 max-w-sm rounded-lg border px-4 py-3 text-sm font-medium shadow-lg ${
            toast.tone === "danger"
              ? "border-rose-200 bg-rose-50 text-rose-800"
              : toast.tone === "success"
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : "border-sky-200 bg-sky-50 text-sky-800"
          }`}
          role={toast.tone === "danger" ? "alert" : "status"}
          aria-live={toast.tone === "danger" ? "assertive" : "polite"}
          aria-atomic="true"
        >
          {toast.message}
        </div>
      )}
      <div className="flex flex-col gap-4 rounded-lg border border-[oklch(88%_0.03_255)] bg-[oklch(99%_0.006_245)] p-4 shadow-[0_1px_2px_oklch(25%_0.04_260_/_0.08)] sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-[oklch(45%_0.13_205)]">
            Operational workspace
          </p>
          <h2
            id="tasks-heading"
            className="mt-1 text-xl font-semibold tracking-tight text-[oklch(25%_0.07_260)]"
          >
            Tasks for {projectName}
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Move work forward, then return to Overview for the project summary.
          </p>
        </div>
        <fieldset
          className="flex rounded-lg border border-[oklch(88%_0.035_255)] bg-[oklch(97%_0.018_245)] p-1"
          aria-label="Task view"
        >
          <button
            type="button"
            onClick={() => setView("board")}
            className={`rounded-md px-3 py-1.5 text-sm font-semibold ${view === "board" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}
            aria-pressed={view === "board"}
          >
            Board
          </button>
          <button
            type="button"
            onClick={() => setView("list")}
            className={`rounded-md px-3 py-1.5 text-sm font-semibold ${view === "list" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}
            aria-pressed={view === "list"}
          >
            List
          </button>
        </fieldset>
        {githubUrl && (
          <button
            type="button"
            onClick={syncGithub}
            disabled={syncingGithub}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            {syncingGithub ? "Syncing…" : "Sync GitHub issues"}
          </button>
        )}
      </div>

      {!githubUrl && (
        <div className="flex flex-col gap-3 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-slate-800">Connect this project to GitHub</p>
            <p className="mt-1 text-xs text-slate-500">
              Add the repository URL to import issues and create GitHub issues from tasks.
            </p>
          </div>
          <button
            type="button"
            onClick={onConnectGithub}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Add repository URL
          </button>
        </div>
      )}

      <div className="flex flex-col gap-2 sm:flex-row">
        <label className="relative min-w-0 flex-1">
          <span className="sr-only">Search tasks</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="w-full min-h-10 rounded-lg border border-[oklch(88%_0.035_255)] bg-white px-3 pl-9 text-sm focus:border-[oklch(67%_0.14_230)] focus:outline-none focus:ring-2 focus:ring-[oklch(74%_0.12_230_/_0.28)]"
            placeholder="Search tasks, descriptions, or labels"
          />
          <span className="pointer-events-none absolute left-3 top-2.5 text-slate-400" aria-hidden>
            ⌕
          </span>
        </label>
        <select
          value={priorityFilter}
          onChange={(event) => setPriorityFilter(event.target.value as "all" | TaskPriority)}
          className="min-h-10 rounded-lg border border-[oklch(88%_0.035_255)] bg-white px-3 text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-[oklch(74%_0.12_230_/_0.28)]"
          aria-label="Filter by priority"
        >
          <option value="all">All priorities</option>
          <option value="high">High priority</option>
          <option value="medium">Medium priority</option>
          <option value="low">Low priority</option>
        </select>
        <div className="flex min-w-0">
          <input
            value={draftTitle}
            onChange={(event) => setDraftTitle(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") addTask();
            }}
            className="min-h-10 min-w-0 flex-1 rounded-s-lg border border-e-0 border-[oklch(88%_0.035_255)] bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[oklch(74%_0.12_230_/_0.28)]"
            placeholder="New task title"
            aria-label="New task title"
          />
          <button
            type="button"
            onClick={addTask}
            disabled={pending}
            className="min-h-10 rounded-e-lg bg-[oklch(28%_0.08_265)] px-4 text-sm font-semibold text-white hover:bg-[oklch(34%_0.1_265)]"
          >
            Add task
          </button>
        </div>
      </div>

      {view === "board" ? (
        <div className="grid gap-3 overflow-x-auto pb-2 xl:grid-cols-5">
          {TASK_COLUMNS.map((column) => (
            // biome-ignore lint/a11y/noNoninteractiveElementInteractions: native drag-and-drop requires a drop target container.
            <section
              key={column.id}
              aria-label={`Drop tasks in ${column.label}`}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => moveTask(column.id)}
              className="min-w-[220px] rounded-lg border border-[oklch(89%_0.03_255)] bg-[oklch(97%_0.018_245)] p-2.5"
            >
              <div className="mb-2 flex items-center justify-between px-1">
                <div className="flex items-center gap-2">
                  <span className={`size-2 rounded-full ${column.tone}`} />
                  <h3 className="text-sm font-semibold text-slate-800">{column.label}</h3>
                </div>
                <span className="text-xs font-semibold text-slate-400">
                  {taskCountByStatus(column.id)}
                </span>
              </div>
              <div className="min-h-32 space-y-2">
                {visibleTasks
                  .filter((task) => task.status === column.id)
                  .map((task) => (
                    <button
                      key={task.id}
                      type="button"
                      draggable
                      onDragStart={() => setDraggedTaskId(task.id)}
                      onClick={() => setSelectedTaskId(task.id)}
                      className="block w-full rounded-lg border border-[oklch(88%_0.03_255)] bg-white p-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-[oklch(74%_0.12_230)]"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="font-semibold leading-5 text-slate-800">{task.title}</span>
                        <span
                          className={`text-[10px] font-bold uppercase ${priorityStyles[task.priority]}`}
                        >
                          {task.priority}
                        </span>
                      </div>
                      <p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-500">
                        {task.description || "No description yet."}
                      </p>
                      <div className="mt-3 flex items-center justify-between gap-2">
                        <span className="truncate text-xs font-medium text-slate-400">
                          {task.assigneeId || "Unassigned"}
                        </span>
                        <span className="flex gap-1">
                          {task.labels.slice(0, 2).map((label) => (
                            <span
                              key={label}
                              className="rounded bg-[oklch(95%_0.035_230)] px-1.5 py-0.5 text-[10px] font-semibold text-[oklch(39%_0.1_230)]"
                            >
                              {label}
                            </span>
                          ))}
                        </span>
                      </div>
                    </button>
                  ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-[oklch(88%_0.03_255)] bg-white shadow-sm">
          <div className="grid grid-cols-[minmax(14rem,1fr)_8rem_7rem_7rem] gap-3 bg-[oklch(97%_0.018_245)] px-4 py-2.5 text-[11px] font-bold uppercase tracking-wide text-slate-500">
            <span>Task</span>
            <span>Status</span>
            <span>Priority</span>
            <span>Assignee</span>
          </div>
          {visibleTasks.map((task) => (
            <button
              key={task.id}
              type="button"
              onClick={() => setSelectedTaskId(task.id)}
              className="grid w-full grid-cols-[minmax(14rem,1fr)_8rem_7rem_7rem] items-center gap-3 border-t border-slate-100 px-4 py-3 text-left text-sm hover:bg-[oklch(98%_0.012_245)]"
            >
              <span className="font-semibold text-slate-800">{task.title}</span>
              <span className="text-slate-600">
                {TASK_COLUMNS.find((column) => column.id === task.status)?.label}
              </span>
              <span className={`font-semibold capitalize ${priorityStyles[task.priority]}`}>
                {task.priority}
              </span>
              <span className="text-slate-500">{task.assigneeId || "Unassigned"}</span>
            </button>
          ))}
        </div>
      )}

      {selectedTask && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/20" role="presentation">
          <aside
            className="h-full w-full max-w-md overflow-y-auto border-l border-slate-200 bg-white p-5 shadow-xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="task-detail-heading"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-[oklch(45%_0.13_205)]">
                  Task details
                </p>
                <h3 id="task-detail-heading" className="mt-1 text-lg font-semibold text-slate-900">
                  {selectedTask.title}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedTaskId(null)}
                className="size-9 rounded-lg text-xl text-slate-400 hover:bg-slate-100"
                aria-label="Close task details"
              >
                ×
              </button>
            </div>
            <div className="mt-6 space-y-4">
              <label className="block text-sm font-semibold text-slate-700">
                Title
                <input
                  value={selectedTask.title}
                  onChange={(event) => updateTask(selectedTask.id, { title: event.target.value })}
                  className="mt-1 w-full min-h-10 rounded-lg border border-slate-200 px-3 text-sm font-normal focus:outline-none focus:ring-2 focus:ring-sky-200"
                />
              </label>
              {githubUrl && (
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
                  {selectedTask.githubIssueUrl ? (
                    <a
                      className="font-semibold text-sky-700 hover:underline"
                      href={selectedTask.githubIssueUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Open GitHub issue #{selectedTask.githubIssueNumber}
                    </a>
                  ) : (
                    <button
                      type="button"
                      disabled={pending}
                      onClick={async () => {
                        setPending(true);
                        try {
                          const updated = await createGithubIssueForTask(
                            projectId,
                            selectedTask.id
                          );
                          setTasks((current) =>
                            current.map((task) => (task.id === updated.id ? updated : task))
                          );
                          setError(null);
                        } catch (requestError) {
                          setError(
                            requestError instanceof Error
                              ? requestError.message
                              : "Unable to create GitHub issue"
                          );
                        } finally {
                          setPending(false);
                        }
                      }}
                      className="font-semibold text-slate-700 hover:text-sky-700 disabled:opacity-60"
                    >
                      Create GitHub issue
                    </button>
                  )}
                </div>
              )}
              <label className="block text-sm font-semibold text-slate-700">
                Description
                <textarea
                  value={selectedTask.description}
                  onChange={(event) =>
                    updateTask(selectedTask.id, { description: event.target.value })
                  }
                  className="mt-1 min-h-28 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-normal focus:outline-none focus:ring-2 focus:ring-sky-200"
                />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="text-sm font-semibold text-slate-700">
                  Status
                  <select
                    value={selectedTask.status}
                    onChange={(event) =>
                      updateTask(selectedTask.id, { status: event.target.value as TaskStatus })
                    }
                    className="mt-1 w-full min-h-10 rounded-lg border border-slate-200 px-2 text-sm font-normal"
                  >
                    <option value="backlog">Backlog</option>
                    <option value="todo">Todo</option>
                    <option value="in-progress">In Progress</option>
                    <option value="review">Review</option>
                    <option value="done">Done</option>
                  </select>
                </label>
                <label className="text-sm font-semibold text-slate-700">
                  Priority
                  <select
                    value={selectedTask.priority}
                    onChange={(event) =>
                      updateTask(selectedTask.id, { priority: event.target.value as TaskPriority })
                    }
                    className="mt-1 w-full min-h-10 rounded-lg border border-slate-200 px-2 text-sm font-normal"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </label>
              </div>
              <label className="block text-sm font-semibold text-slate-700">
                Assignee
                <input
                  value={selectedTask.assigneeId}
                  onChange={(event) =>
                    updateTask(selectedTask.id, { assigneeId: event.target.value })
                  }
                  className="mt-1 w-full min-h-10 rounded-lg border border-slate-200 px-3 text-sm font-normal"
                  placeholder="Unassigned"
                />
              </label>
              <label className="block text-sm font-semibold text-slate-700">
                Due date
                <input
                  type="date"
                  value={selectedTask.dueDate}
                  onChange={(event) => updateTask(selectedTask.id, { dueDate: event.target.value })}
                  className="mt-1 w-full min-h-10 rounded-lg border border-slate-200 px-3 text-sm font-normal"
                />
              </label>
              <button
                type="button"
                onClick={async () => {
                  setPending(true);
                  try {
                    await deleteProjectTask(projectId, selectedTask.id);
                    setSelectedTaskId(null);
                    await refreshTasks();
                  } catch (requestError) {
                    setError(
                      requestError instanceof Error ? requestError.message : "Unable to delete task"
                    );
                  } finally {
                    setPending(false);
                  }
                }}
                disabled={pending}
                className="text-sm font-semibold text-rose-700 hover:text-rose-900"
              >
                Delete task
              </button>
            </div>
          </aside>
        </div>
      )}
      {loading && <p className="text-xs text-slate-400">Loading tasks…</p>}
      {error && (
        <p className="text-sm text-rose-700" role="alert">
          {error}
        </p>
      )}
      <p className="text-xs text-slate-400">Tasks are saved to the project task workspace.</p>
    </section>
  );
}

export default TaskWorkspace;
