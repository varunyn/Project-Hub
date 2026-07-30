"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { deleteProjectTask, fetchAllTasks, updateProjectTask } from "../lib/tasksApi";
import type { Project, ProjectTask, TaskPriority, TaskStatus } from "../types";

const columns: Array<{ id: TaskStatus; label: string; tone: string }> = [
  { id: "backlog", label: "Backlog", tone: "bg-slate-400" },
  { id: "todo", label: "Todo", tone: "bg-sky-500" },
  { id: "in-progress", label: "In Progress", tone: "bg-amber-500" },
  { id: "review", label: "Review", tone: "bg-violet-500" },
  { id: "done", label: "Done", tone: "bg-emerald-500" },
];

const priorityStyles: Record<TaskPriority, string> = {
  low: "text-slate-500",
  medium: "text-amber-700",
  high: "text-rose-700",
};

interface GlobalTaskBoardProps {
  projects: Project[];
}

interface ToastState {
  message: string;
}

export default function GlobalTaskBoard({ projects }: GlobalTaskBoardProps) {
  const [tasks, setTasks] = useState<ProjectTask[]>([]);
  const [query, setQuery] = useState("");
  const [projectFilter, setProjectFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState<"all" | TaskPriority>("all");
  const [view, setView] = useState<"board" | "list">("board");
  const [selectedTask, setSelectedTask] = useState<ProjectTask | null>(null);
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setTasks(await fetchAllTasks());
      setError(null);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to load tasks");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh().catch(() => undefined);
  }, [refresh]);

  const announce = useCallback((message: string) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ message });
    toastTimerRef.current = setTimeout(() => setToast(null), 4500);
  }, []);

  useEffect(
    () => () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    },
    []
  );

  const projectNames = useMemo(
    () => new Map(projects.map((project) => [project.id, project.name])),
    [projects]
  );
  const visibleTasks = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return tasks.filter((task) => {
      const searchable = `${task.title} ${task.description} ${task.labels.join(" ")}`.toLowerCase();
      return (
        (!normalizedQuery || searchable.includes(normalizedQuery)) &&
        (projectFilter === "all" || task.projectId === projectFilter) &&
        (priorityFilter === "all" || task.priority === priorityFilter)
      );
    });
  }, [priorityFilter, projectFilter, query, tasks]);

  const updateTask = async (task: ProjectTask, changes: Partial<ProjectTask>) => {
    setPending(true);
    try {
      await updateProjectTask(task.projectId, task.id, changes);
      await refresh();
      setSelectedTask((current) =>
        current?.id === task.id ? { ...current, ...changes } : current
      );
    } catch (requestError) {
      const message =
        requestError instanceof Error ? requestError.message : "Unable to update task";
      setError(message);
      announce(`Task update failed — ${message}`);
    } finally {
      setPending(false);
    }
  };

  const moveTask = async (status: TaskStatus) => {
    const task = tasks.find((item) => item.id === draggedTaskId);
    if (!task || task.status === status) return;
    setDraggedTaskId(null);
    const previousTasks = tasks;
    setTasks((current) =>
      current.map((item) => (item.id === task.id ? { ...item, status } : item))
    );
    setPending(true);
    try {
      const updated = await updateProjectTask(task.projectId, task.id, { status });
      setTasks((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      setSelectedTask((current) =>
        current?.id === updated.id ? { ...current, ...updated } : current
      );
      setError(null);
    } catch (requestError) {
      setTasks(previousTasks);
      const message = requestError instanceof Error ? requestError.message : "Unable to move task";
      setError(message);
      announce(`Task move failed — ${message}`);
    } finally {
      setPending(false);
    }
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
        <span className={`text-xs font-bold uppercase ${priorityStyles[task.priority]}`}>
          {task.priority}
        </span>
      </div>
      <p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-500">
        {task.description || "No description yet."}
      </p>
      <p className="mt-3 truncate text-xs font-medium text-slate-400">
        {projectNames.get(task.projectId) ?? "Unknown project"}
      </p>
    </button>
  );

  return (
    <section className="space-y-5" aria-labelledby="global-tasks-heading">
      {toast && (
        <div
          className="fixed bottom-5 right-5 z-50 max-w-sm rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800 shadow-lg"
          role="alert"
          aria-live="assertive"
          aria-atomic="true"
        >
          {toast.message}
        </div>
      )}
      <header className="rounded-lg border border-[oklch(88%_0.03_255)] bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-[oklch(45%_0.13_205)]">
              Operational workspace
            </p>
            <h1
              id="global-tasks-heading"
              className="mt-1 text-2xl font-semibold tracking-tight text-slate-950"
            >
              All tasks
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              One board for every project, with each card linked to its project context.
            </p>
          </div>
          <fieldset
            className="flex rounded-lg border border-slate-200 bg-slate-50 p-1"
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
        </div>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="min-h-10 min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-sky-200"
            placeholder="Search tasks, descriptions, or labels"
            aria-label="Search all tasks"
          />
          <select
            value={projectFilter}
            onChange={(event) => setProjectFilter(event.target.value)}
            className="min-h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm"
            aria-label="Filter by project"
          >
            <option value="all">All projects</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
          <select
            value={priorityFilter}
            onChange={(event) => setPriorityFilter(event.target.value as "all" | TaskPriority)}
            className="min-h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm"
            aria-label="Filter by priority"
          >
            <option value="all">All priorities</option>
            <option value="high">High priority</option>
            <option value="medium">Medium priority</option>
            <option value="low">Low priority</option>
          </select>
        </div>
      </header>

      {error && (
        <p
          className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800"
          role="alert"
        >
          {error}
        </p>
      )}
      {loading ? (
        <p className="text-sm text-slate-500">Loading tasks…</p>
      ) : visibleTasks.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-10 text-center">
          <p className="font-semibold text-slate-800">No tasks match these filters.</p>
          <p className="mt-1 text-sm text-slate-500">
            Create tasks from a project workspace to see them here.
          </p>
        </div>
      ) : view === "board" ? (
        <div className="grid gap-3 overflow-x-auto pb-2 xl:grid-cols-5">
          {columns.map((column) => (
            // biome-ignore lint/a11y/noNoninteractiveElementInteractions: native drag-and-drop requires a drop target container.
            <section
              key={column.id}
              aria-label={`Drop tasks in ${column.label}`}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => moveTask(column.id)}
              className="min-w-[220px] rounded-lg border border-slate-200 bg-slate-50 p-2.5"
            >
              <div className="mb-2 flex items-center justify-between px-1">
                <div className="flex items-center gap-2">
                  <span className={`size-2 rounded-full ${column.tone}`} />
                  <h2 className="text-sm font-semibold text-slate-800">{column.label}</h2>
                </div>
                <span className="text-xs font-semibold text-slate-400">
                  {visibleTasks.filter((task) => task.status === column.id).length}
                </span>
              </div>
              <div className="min-h-32 space-y-2">
                {visibleTasks.filter((task) => task.status === column.id).map(taskCard)}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="grid grid-cols-[minmax(14rem,1fr)_minmax(10rem,0.7fr)_7rem] gap-3 bg-slate-50 px-4 py-2.5 text-xs font-bold uppercase tracking-wide text-slate-500">
            <span>Task</span>
            <span>Project</span>
            <span>Status</span>
          </div>
          {visibleTasks.map((task) => (
            <button
              key={task.id}
              type="button"
              onClick={() => setSelectedTask(task)}
              className="grid w-full grid-cols-[minmax(14rem,1fr)_minmax(10rem,0.7fr)_7rem] gap-3 border-t border-slate-100 px-4 py-3 text-left text-sm hover:bg-slate-50"
            >
              <span className="font-semibold text-slate-800">{task.title}</span>
              <span className="truncate text-slate-500">
                {projectNames.get(task.projectId) ?? "Unknown project"}
              </span>
              <span className={priorityStyles[task.priority]}>
                {columns.find((column) => column.id === task.status)?.label}
              </span>
            </button>
          ))}
        </div>
      )}

      {selectedTask && (
        <aside
          className="fixed inset-y-0 right-0 z-50 w-full max-w-md overflow-y-auto border-l border-slate-200 bg-white p-5 shadow-xl"
          role="dialog"
          aria-modal="true"
          aria-labelledby="global-task-detail-heading"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-[oklch(45%_0.13_205)]">
                Task details
              </p>
              <h2
                id="global-task-detail-heading"
                className="mt-1 text-lg font-semibold text-slate-900"
              >
                {selectedTask.title}
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                {projectNames.get(selectedTask.projectId) ?? "Unknown project"}
              </p>
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
                onChange={(event) =>
                  setSelectedTask({ ...selectedTask, title: event.target.value })
                }
                onBlur={() => updateTask(selectedTask, { title: selectedTask.title })}
                className="mt-1 min-h-10 w-full rounded-lg border border-slate-200 px-3 text-sm font-normal"
              />
            </label>
            <label className="block text-sm font-semibold text-slate-700">
              Status
              <select
                value={selectedTask.status}
                disabled={pending}
                onChange={(event) =>
                  updateTask(selectedTask, { status: event.target.value as TaskStatus })
                }
                className="mt-1 min-h-10 w-full rounded-lg border border-slate-200 px-3 text-sm font-normal"
              >
                <option value="backlog">Backlog</option>
                <option value="todo">Todo</option>
                <option value="in-progress">In Progress</option>
                <option value="review">Review</option>
                <option value="done">Done</option>
              </select>
            </label>
            <label className="block text-sm font-semibold text-slate-700">
              Priority
              <select
                value={selectedTask.priority}
                disabled={pending}
                onChange={(event) =>
                  updateTask(selectedTask, { priority: event.target.value as TaskPriority })
                }
                className="mt-1 min-h-10 w-full rounded-lg border border-slate-200 px-3 text-sm font-normal"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </label>
            <button
              type="button"
              disabled={pending}
              onClick={async () => {
                setPending(true);
                try {
                  await deleteProjectTask(selectedTask.projectId, selectedTask.id);
                  setSelectedTask(null);
                  await refresh();
                } catch (requestError) {
                  setError(
                    requestError instanceof Error ? requestError.message : "Unable to delete task"
                  );
                } finally {
                  setPending(false);
                }
              }}
              className="text-sm font-semibold text-rose-700"
            >
              Delete task
            </button>
          </div>
        </aside>
      )}
    </section>
  );
}
