"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { TASK_COLUMNS, type ToastState } from "../lib/taskConstants";
import { filterTasks } from "../lib/taskFilter";
import type { Project, ProjectTask, TaskPriority, TaskStatus } from "../types";

const priorityStyles: Record<TaskPriority, string> = {
  low: "text-slate-500",
  medium: "text-amber-700",
  high: "text-rose-700",
};

export interface TaskBoardProps {
  tasks: ProjectTask[];
  projects?: Project[];
  title: React.ReactNode;
  loading?: boolean;
  error?: string | null;
  onCreateTask?: (title: string) => Promise<ProjectTask>;
  onUpdateTask: (task: ProjectTask, changes: Partial<ProjectTask>) => Promise<void>;
  onDeleteTask: (task: ProjectTask) => Promise<void>;
  onMoveTask: (task: ProjectTask, status: TaskStatus) => Promise<void>;
  githubUrl?: string;
  onConnectGithub?: () => void;
  onSyncGithub?: () => Promise<{ total: number; imported: number } | undefined>;
  onCreateGithubIssue?: (taskId: string) => Promise<ProjectTask>;
}

export default function TaskBoard({
  tasks,
  projects,
  title,
  loading = false,
  error: externalError = null,
  onCreateTask,
  onUpdateTask,
  onDeleteTask,
  onMoveTask,
  githubUrl,
  onConnectGithub,
  onSyncGithub,
  onCreateGithubIssue,
}: TaskBoardProps) {
  const [localTasks, setLocalTasks] = useState<ProjectTask[]>(tasks);
  const [view, setView] = useState<"board" | "list">("board");
  const [query, setQuery] = useState("");
  const [priorityFilter, setPriorityFilter] = useState<"all" | TaskPriority>("all");
  const [projectFilter, setProjectFilter] = useState("all");
  const [selectedTask, setSelectedTask] = useState<ProjectTask | null>(null);
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [syncingGithub, setSyncingGithub] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [internalError, setInternalError] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setLocalTasks(tasks);
  }, [tasks]);

  useEffect(() => {
    setSelectedTask((current) => {
      if (!current) return current;
      const updated = localTasks.find((task) => task.id === current.id) ?? null;
      if (!updated) return null;
      // Preserve any in-progress local edits by merging the server's version
      // underneath the current local fields. Status and priority are always
      // authoritative from the server; text fields keep local edits while
      // the panel is open so the cursor does not jump.
      return {
        ...updated,
        title: current.title,
        description: current.description,
        assigneeId: current.assigneeId,
        dueDate: current.dueDate,
      };
    });
  }, [localTasks]);

  const announce = useCallback((message: string, tone: ToastState["tone"]) => {
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

  const projectNames = useMemo(() => {
    if (!projects) return new Map<string, string>();
    return new Map(projects.map((project) => [project.id, project.name]));
  }, [projects]);

  const visibleTasks = useMemo(
    () =>
      filterTasks(localTasks, {
        query,
        priority: priorityFilter,
        projectId: projects ? projectFilter : "all",
      }),
    [localTasks, query, priorityFilter, projectFilter, projects]
  );

  const taskCountByStatus = useCallback(
    (status: TaskStatus) => localTasks.filter((task) => task.status === status).length,
    [localTasks]
  );

  const displayedError = externalError ?? internalError;

  const handleCreateTask = async () => {
    if (!onCreateTask) return;
    const title = draftTitle.trim();
    if (!title) return;
    setPending(true);
    try {
      const created = await onCreateTask(title);
      setLocalTasks((current) => [...current, created]);
      setSelectedTask(created);
      setDraftTitle("");
      setInternalError(null);
    } catch (requestError) {
      const message =
        requestError instanceof Error ? requestError.message : "Unable to create task";
      setInternalError(message);
      announce(`Task creation failed — ${message}`, "danger");
    } finally {
      setPending(false);
    }
  };

  const handleUpdateTask = async (task: ProjectTask, changes: Partial<ProjectTask>) => {
    setPending(true);
    try {
      await onUpdateTask(task, changes);
      setInternalError(null);
    } catch (requestError) {
      const message =
        requestError instanceof Error ? requestError.message : "Unable to update task";
      setInternalError(message);
      announce(`Task update failed — ${message}`, "danger");
      const original = tasks.find((item) => item.id === task.id) ?? null;
      if (original && selectedTask?.id === task.id) {
        setSelectedTask(original);
      }
    } finally {
      setPending(false);
    }
  };

  const handleMoveTask = async (status: TaskStatus) => {
    if (!draggedTaskId) return;
    const task = localTasks.find((item) => item.id === draggedTaskId);
    if (!task || task.status === status) return;
    const previousTasks = localTasks;
    setLocalTasks((current) =>
      current.map((item) => (item.id === task.id ? { ...item, status } : item))
    );
    setDraggedTaskId(null);
    setPending(true);
    try {
      await onMoveTask(task, status);
      setInternalError(null);
    } catch (requestError) {
      setLocalTasks(previousTasks);
      const message = requestError instanceof Error ? requestError.message : "Unable to move task";
      setInternalError(message);
      announce(`Task move failed — ${message}`, "danger");
    } finally {
      setPending(false);
    }
  };

  const handleDeleteTask = async (task: ProjectTask) => {
    setPending(true);
    try {
      await onDeleteTask(task);
      if (selectedTask?.id === task.id) setSelectedTask(null);
      setLocalTasks((current) => current.filter((item) => item.id !== task.id));
      setInternalError(null);
    } catch (requestError) {
      const message =
        requestError instanceof Error ? requestError.message : "Unable to delete task";
      setInternalError(message);
      announce(`Task deletion failed — ${message}`, "danger");
    } finally {
      setPending(false);
    }
  };

  const handleSyncGithub = async () => {
    if (!onSyncGithub) return;
    setSyncingGithub(true);
    announce("Checking GitHub for issue updates…", "info");
    try {
      const result = await onSyncGithub();
      setInternalError(null);
      if (!result || result.total === 0) {
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
      setInternalError(message);
      announce(`GitHub sync failed — ${message}`, "danger");
    } finally {
      setSyncingGithub(false);
    }
  };

  const handleCreateGithubIssue = async (taskId: string) => {
    if (!onCreateGithubIssue) return;
    setPending(true);
    try {
      const updated = await onCreateGithubIssue(taskId);
      setLocalTasks((current) => current.map((task) => (task.id === updated.id ? updated : task)));
      if (selectedTask?.id === updated.id) setSelectedTask(updated);
      setInternalError(null);
    } catch (requestError) {
      const message =
        requestError instanceof Error ? requestError.message : "Unable to create GitHub issue";
      setInternalError(message);
      announce(`GitHub issue creation failed — ${message}`, "danger");
    } finally {
      setPending(false);
    }
  };

  const handleSelectedTaskChange = (changes: Partial<ProjectTask>) => {
    if (!selectedTask) return;
    setSelectedTask({ ...selectedTask, ...changes });
  };

  const taskCard = (task: ProjectTask) => (
    <button
      key={task.id}
      type="button"
      draggable
      onDragStart={() => setDraggedTaskId(task.id)}
      onClick={() => setSelectedTask(task)}
      className="block w-full rounded-lg border border-[oklch(88%_0.03_255)] bg-white p-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-[oklch(74%_0.12_230)]"
    >
      <div className="flex items-start justify-between gap-2">
        <span className="font-semibold leading-5 text-slate-800">{task.title}</span>
        <span className={`text-[10px] font-bold uppercase ${priorityStyles[task.priority]}`}>
          {task.priority}
        </span>
      </div>
      <p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-500">
        {task.description || "No description yet."}
      </p>
      {projects && (
        <p className="mt-3 truncate text-xs font-medium text-slate-400">
          {projectNames.get(task.projectId) ?? "Unknown project"}
        </p>
      )}
      {!projects && (
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
      )}
    </button>
  );

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
            {title}
          </h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <fieldset
            className="flex rounded-lg border border-[oklch(88%_0.035_255)] bg-[oklch(97%_0.018_245)] p-1"
            aria-label="Task view"
          >
            {(["board", "list"] as const).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setView(option)}
                aria-pressed={view === option}
                className={`rounded-md px-3 py-1.5 text-sm font-semibold capitalize ${view === option ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}
              >
                {option}
              </button>
            ))}
          </fieldset>
          {githubUrl && onSyncGithub && (
            <button
              type="button"
              onClick={handleSyncGithub}
              disabled={syncingGithub}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            >
              {syncingGithub ? "Syncing…" : "Sync GitHub issues"}
            </button>
          )}
        </div>
      </div>

      {onConnectGithub && !githubUrl && (
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
        {projects && (
          <select
            value={projectFilter}
            onChange={(event) => setProjectFilter(event.target.value)}
            className="min-h-10 rounded-lg border border-[oklch(88%_0.035_255)] bg-white px-3 text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-[oklch(74%_0.12_230_/_0.28)]"
            aria-label="Filter by project"
          >
            <option value="all">All projects</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        )}
        {onCreateTask && (
          <div className="flex min-w-0">
            <input
              value={draftTitle}
              onChange={(event) => setDraftTitle(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") handleCreateTask();
              }}
              className="min-h-10 min-w-0 flex-1 rounded-s-lg border border-e-0 border-[oklch(88%_0.035_255)] bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[oklch(74%_0.12_230_/_0.28)]"
              placeholder="New task title"
              aria-label="New task title"
            />
            <button
              type="button"
              onClick={handleCreateTask}
              disabled={pending}
              className="min-h-10 rounded-e-lg bg-[oklch(28%_0.08_265)] px-4 text-sm font-semibold text-white hover:bg-[oklch(34%_0.1_265)]"
            >
              Add task
            </button>
          </div>
        )}
      </div>

      {displayedError && (
        <p className="text-sm text-rose-700" role="alert">
          {displayedError}
        </p>
      )}

      {loading ? (
        <p className="text-sm text-slate-500">Loading tasks…</p>
      ) : visibleTasks.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-10 text-center">
          <p className="font-semibold text-slate-800">No tasks match these filters.</p>
          <p className="mt-1 text-sm text-slate-500">
            {onCreateTask
              ? "Create a task to get started."
              : "Create tasks from a project workspace to see them here."}
          </p>
        </div>
      ) : view === "board" ? (
        <div className="grid gap-3 overflow-x-auto pb-2 xl:grid-cols-5">
          {TASK_COLUMNS.map((column) => (
            // biome-ignore lint/a11y/noNoninteractiveElementInteractions: native drag-and-drop requires a drop target container.
            <section
              key={column.id}
              aria-label={`Drop tasks in ${column.label}`}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => handleMoveTask(column.id)}
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
                  .map((task) => taskCard(task))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-[oklch(88%_0.03_255)] bg-white shadow-sm">
          <div
            className={`grid gap-3 bg-[oklch(97%_0.018_245)] px-4 py-2.5 text-[11px] font-bold uppercase tracking-wide text-slate-500 ${projects ? "grid-cols-[minmax(14rem,1fr)_minmax(10rem,0.7fr)_7rem]" : "grid-cols-[minmax(14rem,1fr)_8rem_7rem_7rem]"}`}
          >
            <span>Task</span>
            {projects && <span>Project</span>}
            {!projects && (
              <>
                <span>Status</span>
                <span>Priority</span>
                <span>Assignee</span>
              </>
            )}
            {projects && <span>Status</span>}
          </div>
          {visibleTasks.map((task) => (
            <button
              key={task.id}
              type="button"
              onClick={() => setSelectedTask(task)}
              className={`grid w-full items-center gap-3 border-t border-slate-100 px-4 py-3 text-left text-sm hover:bg-[oklch(98%_0.012_245)] ${projects ? "grid-cols-[minmax(14rem,1fr)_minmax(10rem,0.7fr)_7rem]" : "grid-cols-[minmax(14rem,1fr)_8rem_7rem_7rem]"}`}
            >
              <span className="font-semibold text-slate-800">{task.title}</span>
              {projects && (
                <span className="truncate text-slate-500">
                  {projectNames.get(task.projectId) ?? "Unknown project"}
                </span>
              )}
              {!projects && (
                <>
                  <span className="text-slate-600">
                    {TASK_COLUMNS.find((column) => column.id === task.status)?.label}
                  </span>
                  <span className={`font-semibold capitalize ${priorityStyles[task.priority]}`}>
                    {task.priority}
                  </span>
                  <span className="text-slate-500">{task.assigneeId || "Unassigned"}</span>
                </>
              )}
              {projects && (
                <span className={priorityStyles[task.priority]}>
                  {TASK_COLUMNS.find((column) => column.id === task.status)?.label}
                </span>
              )}
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
                {projects && (
                  <p className="mt-1 text-xs text-slate-500">
                    {projectNames.get(selectedTask.projectId) ?? "Unknown project"}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setSelectedTask(null)}
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
                  onChange={(event) => handleSelectedTaskChange({ title: event.target.value })}
                  onBlur={() => handleUpdateTask(selectedTask, { title: selectedTask.title })}
                  className="mt-1 w-full min-h-10 rounded-lg border border-slate-200 px-3 text-sm font-normal focus:outline-none focus:ring-2 focus:ring-sky-200"
                />
              </label>
              {githubUrl && onCreateGithubIssue && (
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
                      onClick={() => handleCreateGithubIssue(selectedTask.id)}
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
                    handleSelectedTaskChange({ description: event.target.value })
                  }
                  onBlur={() =>
                    handleUpdateTask(selectedTask, { description: selectedTask.description })
                  }
                  className="mt-1 min-h-28 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-normal focus:outline-none focus:ring-2 focus:ring-sky-200"
                />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="text-sm font-semibold text-slate-700">
                  Status
                  <select
                    value={selectedTask.status}
                    disabled={pending}
                    onChange={(event) =>
                      handleUpdateTask(selectedTask, {
                        status: event.target.value as TaskStatus,
                      })
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
                    disabled={pending}
                    onChange={(event) =>
                      handleUpdateTask(selectedTask, {
                        priority: event.target.value as TaskPriority,
                      })
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
                  onChange={(event) => handleSelectedTaskChange({ assigneeId: event.target.value })}
                  onBlur={() =>
                    handleUpdateTask(selectedTask, { assigneeId: selectedTask.assigneeId })
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
                  onChange={(event) => handleSelectedTaskChange({ dueDate: event.target.value })}
                  onBlur={() => handleUpdateTask(selectedTask, { dueDate: selectedTask.dueDate })}
                  className="mt-1 w-full min-h-10 rounded-lg border border-slate-200 px-3 text-sm font-normal"
                />
              </label>
              <button
                type="button"
                onClick={() => handleDeleteTask(selectedTask)}
                disabled={pending}
                className="text-sm font-semibold text-rose-700 hover:text-rose-900 disabled:opacity-60"
              >
                Delete task
              </button>
            </div>
          </aside>
        </div>
      )}
    </section>
  );
}
