"use client";

import Image from "next/image";
import Link from "next/link";
import { notFound, useParams, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { siCursor } from "simple-icons";
import useSWR from "swr";
import ProjectDependencyUpdates from "../../../components/ProjectDependencyUpdates";
import {
  ProjectDetailHeader,
  ProjectDetailsCard,
  ProjectDetailTabs,
} from "../../../components/ProjectDetailHeader";
import ProjectForm from "../../../components/ProjectForm";
import { pushRecentProjectId } from "../../../components/Sidebar";
import { useProject } from "../../../hooks/useProject";
import { useProjects } from "../../../hooks/useProjects";
import type { Project } from "../../../types";
import { formatCommitDate } from "../../../utils/format";

interface GitCommit {
  hash: string;
  subject: string;
  date: string;
}

type TaskStatus = "backlog" | "todo" | "in-progress" | "review" | "done";
type TaskPriority = "low" | "medium" | "high";

interface ProjectTask {
  id: string;
  projectId: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  assigneeId: string;
  labels: string[];
  dueDate: string;
  position: number;
  createdAt: string;
  updatedAt: string;
}

const TASK_COLUMNS: Array<{ id: TaskStatus; label: string; tone: string }> = [
  { id: "backlog", label: "Backlog", tone: "bg-slate-400" },
  { id: "todo", label: "Todo", tone: "bg-sky-500" },
  { id: "in-progress", label: "In Progress", tone: "bg-amber-500" },
  { id: "review", label: "Review", tone: "bg-violet-500" },
  { id: "done", label: "Done", tone: "bg-emerald-500" },
];

const TASK_SEEDS: Omit<ProjectTask, "projectId">[] = [
  {
    id: "task-1",
    title: "Define project milestones",
    description: "Break the next release into shippable milestones.",
    status: "in-progress",
    priority: "high",
    assigneeId: "You",
    labels: ["planning"],
    dueDate: "",
    position: 0,
    createdAt: "2026-07-20",
    updatedAt: "2026-07-28",
  },
  {
    id: "task-2",
    title: "Review open issues",
    description: "Triage the current issue queue and identify blockers.",
    status: "todo",
    priority: "medium",
    assigneeId: "You",
    labels: ["maintenance"],
    dueDate: "",
    position: 1,
    createdAt: "2026-07-21",
    updatedAt: "2026-07-27",
  },
  {
    id: "task-3",
    title: "Document the local setup",
    description: "Capture the commands needed to run this project locally.",
    status: "backlog",
    priority: "low",
    assigneeId: "",
    labels: ["docs"],
    dueDate: "",
    position: 2,
    createdAt: "2026-07-22",
    updatedAt: "2026-07-25",
  },
  {
    id: "task-4",
    title: "Ship the first slice",
    description: "Validate the working surface before sharing it.",
    status: "review",
    priority: "high",
    assigneeId: "You",
    labels: ["release"],
    dueDate: "",
    position: 3,
    createdAt: "2026-07-23",
    updatedAt: "2026-07-26",
  },
  {
    id: "task-5",
    title: "Create project workspace",
    description: "Set up the project shell and connect the first workflow.",
    status: "done",
    priority: "medium",
    assigneeId: "You",
    labels: ["setup"],
    dueDate: "",
    position: 4,
    createdAt: "2026-07-18",
    updatedAt: "2026-07-24",
  },
];

function TaskWorkspace({ projectId, projectName }: { projectId: string; projectName: string }) {
  const [tasks, setTasks] = useState<ProjectTask[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [view, setView] = useState<"board" | "list">("board");
  const [query, setQuery] = useState("");
  const [priorityFilter, setPriorityFilter] = useState<"all" | TaskPriority>("all");
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);

  useEffect(() => {
    const stored = window.localStorage.getItem(`project-hub:tasks:${projectId}`);
    setTasks(
      stored
        ? (JSON.parse(stored) as ProjectTask[])
        : TASK_SEEDS.map((task) => ({ ...task, projectId }))
    );
    setHydrated(true);
  }, [projectId]);

  useEffect(() => {
    if (hydrated)
      window.localStorage.setItem(`project-hub:tasks:${projectId}`, JSON.stringify(tasks));
  }, [hydrated, projectId, tasks]);

  const visibleTasks = tasks.filter((task) => {
    const matchesQuery = `${task.title} ${task.description} ${task.labels.join(" ")}`
      .toLowerCase()
      .includes(query.toLowerCase());
    return matchesQuery && (priorityFilter === "all" || task.priority === priorityFilter);
  });
  const selectedTask = tasks.find((task) => task.id === selectedTaskId) ?? null;
  const updateTask = (id: string, changes: Partial<ProjectTask>) => {
    setTasks((current) =>
      current.map((task) =>
        task.id === id
          ? { ...task, ...changes, updatedAt: new Date().toISOString().slice(0, 10) }
          : task
      )
    );
  };
  const addTask = () => {
    const title = draftTitle.trim();
    if (!title) return;
    const task: ProjectTask = {
      id: `task-${Date.now()}`,
      projectId,
      title,
      description: "",
      status: "todo",
      priority: "medium",
      assigneeId: "You",
      labels: [],
      dueDate: "",
      position: tasks.length,
      createdAt: new Date().toISOString().slice(0, 10),
      updatedAt: new Date().toISOString().slice(0, 10),
    };
    setTasks((current) => [...current, task]);
    setDraftTitle("");
    setSelectedTaskId(task.id);
  };
  const moveTask = (status: TaskStatus) => {
    if (!draggedTaskId) return;
    updateTask(draggedTaskId, { status });
    setDraggedTaskId(null);
  };
  const taskCountByStatus = (status: TaskStatus) =>
    tasks.filter((task) => task.status === status).length;
  const priorityStyles: Record<TaskPriority, string> = {
    low: "text-slate-500",
    medium: "text-amber-700",
    high: "text-rose-700",
  };

  return (
    <section className="space-y-4" aria-labelledby="tasks-heading">
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
      </div>

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
                onClick={() => {
                  setTasks((current) => current.filter((task) => task.id !== selectedTask.id));
                  setSelectedTaskId(null);
                }}
                className="text-sm font-semibold text-rose-700 hover:text-rose-900"
              >
                Delete task
              </button>
            </div>
          </aside>
        </div>
      )}
      <p className="text-xs text-slate-400">
        Tasks are currently saved to this project in your local browser workspace.
      </p>
    </section>
  );
}

function OverviewTaskSummary({ projectId }: { projectId: string }) {
  const [tasks, setTasks] = useState<ProjectTask[]>([]);
  useEffect(() => {
    const stored = window.localStorage.getItem(`project-hub:tasks:${projectId}`);
    setTasks(
      stored
        ? (JSON.parse(stored) as ProjectTask[])
        : TASK_SEEDS.map((task) => ({ ...task, projectId }))
    );
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

async function fetcherGitLog(url: string): Promise<GitCommit[]> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) return [];
  const data = (await res.json()) as { commits?: GitCommit[] };
  return data.commits ?? [];
}

const CURSOR_ICON_PATH = siCursor.path;
const TAG_LISTBOX_ID = "project-tag-listbox";

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
        <TaskWorkspace projectId={project.id} projectName={project.name} />
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

              <section className={cardClass}>
                <h2 className={sectionTitleClass}>Tags</h2>
                <div className="mb-3 flex flex-wrap gap-2">
                  {(project.tags ?? []).map((tag) => (
                    <span
                      key={tag}
                      className="inline-flex min-h-7 items-center gap-1 rounded-md bg-[oklch(96%_0.03_230)] px-2 py-0.5 text-sm font-medium text-[oklch(34%_0.08_245)] ring-1 ring-[oklch(86%_0.06_230)]"
                    >
                      {tag}
                      <button
                        type="button"
                        onClick={() => handleRemoveTag(tag)}
                        className="ml-0.5 inline-flex size-5 items-center justify-center rounded-full text-[oklch(48%_0.09_225)] transition-colors hover:bg-[oklch(95%_0.06_25)] hover:text-[oklch(50%_0.16_25)] focus:outline-none focus:ring-2 focus:ring-[oklch(78%_0.13_25)]"
                        aria-label={`Remove ${tag}`}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                  {(!project.tags || project.tags.length === 0) && (
                    <span className="text-sm font-medium text-[oklch(50%_0.07_260)]">
                      No tags yet.
                    </span>
                  )}
                </div>
                <div className="relative flex flex-col gap-2 sm:flex-row" ref={tagDropdownRef}>
                  <div className="relative flex-1">
                    <input
                      type="text"
                      placeholder="Add tag"
                      value={tagInput}
                      onChange={(event) => {
                        setTagInput(event.target.value);
                        setTagHighlightIndex(0);
                        setTagDropdownOpen(true);
                      }}
                      onFocus={() => setTagDropdownOpen(true)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          if (
                            tagSuggestions.canCreateNew &&
                            effectiveHighlightIndex === tagSuggestions.existing.length
                          ) {
                            handleAddTag(tagSuggestions.newTag);
                            return;
                          }
                          const existing = tagSuggestions.existing[effectiveHighlightIndex];
                          handleAddTag(existing);
                          return;
                        }
                        if (event.key === "Escape") {
                          setTagDropdownOpen(false);
                          return;
                        }
                        if (event.key === "ArrowDown" && tagOptionCount > 0) {
                          event.preventDefault();
                          setTagHighlightIndex((index) => (index + 1) % tagOptionCount);
                          return;
                        }
                        if (event.key === "ArrowUp" && tagOptionCount > 0) {
                          event.preventDefault();
                          setTagHighlightIndex(
                            (index) => (tagOptionCount + index - 1) % tagOptionCount
                          );
                        }
                      }}
                      className={inputClass}
                      autoComplete="off"
                      role="combobox"
                      aria-label="Add or select a tag"
                      aria-autocomplete="list"
                      aria-expanded={tagDropdownOpen}
                      aria-controls={TAG_LISTBOX_ID}
                      aria-activedescendant={
                        tagDropdownOpen && tagOptionCount > 0
                          ? `tag-option-${effectiveHighlightIndex}`
                          : undefined
                      }
                    />
                    {tagDropdownOpen && tagOptionCount > 0 && (
                      <div
                        id={TAG_LISTBOX_ID}
                        role="listbox"
                        className="absolute z-10 mt-1 max-h-48 w-full overflow-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg ring-1 ring-slate-950/[0.05]"
                      >
                        {tagSuggestions.existing.map((tag, index) => (
                          <button
                            key={tag}
                            id={`tag-option-${index}`}
                            type="button"
                            role="option"
                            aria-selected={effectiveHighlightIndex === index}
                            className={`block w-full px-3 py-2 text-left text-sm ${
                              effectiveHighlightIndex === index
                                ? "bg-[oklch(96%_0.03_230)] text-[oklch(31%_0.12_230)]"
                                : "text-slate-700 hover:bg-[oklch(97%_0.035_205)]"
                            }`}
                            onMouseDown={(event) => {
                              event.preventDefault();
                              handleAddTag(tag);
                            }}
                          >
                            {tag}
                          </button>
                        ))}
                        {tagSuggestions.canCreateNew && (
                          <button
                            id={`tag-option-${tagSuggestions.existing.length}`}
                            type="button"
                            role="option"
                            aria-selected={
                              effectiveHighlightIndex === tagSuggestions.existing.length
                            }
                            className={`block w-full border-t border-slate-100 px-3 py-2 text-left text-sm ${
                              effectiveHighlightIndex === tagSuggestions.existing.length
                                ? "bg-[oklch(96%_0.03_230)] text-[oklch(31%_0.12_230)]"
                                : "text-slate-600 hover:bg-[oklch(97%_0.035_205)]"
                            }`}
                            onMouseDown={(event) => {
                              event.preventDefault();
                              handleAddTag(tagSuggestions.newTag);
                            }}
                          >
                            <span className="text-slate-500">Create tag:</span>{" "}
                            {tagSuggestions.newTag}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => handleAddTag()}
                    disabled={!hasTagInput}
                    className={btnPrimary}
                  >
                    Add
                  </button>
                </div>
              </section>

              <section className={cardClass}>
                <h2 className={sectionTitleClass}>Notes</h2>
                {isEditingNote ? (
                  <div className="flex flex-col gap-3">
                    <textarea
                      placeholder="Add a note"
                      value={noteInput}
                      onChange={(event) => setNoteInput(event.target.value)}
                      className={`min-h-20 ${inputClass}`}
                      aria-label={project.notes ? "Edit note" : "Add note"}
                    />
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={handleSaveNote}
                        disabled={!hasNoteInput}
                        className={btnPrimary}
                      >
                        Save note
                      </button>
                      <button type="button" onClick={handleCancelNoteEdit} className={btnSecondary}>
                        Cancel
                      </button>
                      <button type="button" onClick={handleDeleteNote} className={btnDanger}>
                        {project.notes ? "Delete note" : "Clear"}
                      </button>
                    </div>
                  </div>
                ) : project.notes ? (
                  <div className="space-y-3">
                    <p className="max-w-3xl whitespace-pre-wrap text-sm leading-6 text-slate-700">
                      {project.notes}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <button type="button" onClick={handleStartNoteEdit} className={btnPrimary}>
                        Edit note
                      </button>
                      <button type="button" onClick={handleDeleteNote} className={btnDanger}>
                        Delete note
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col gap-3">
                    <p className="text-sm font-medium text-[oklch(50%_0.07_260)]">No notes yet.</p>
                    <textarea
                      placeholder="Add a note"
                      value={noteInput}
                      onChange={(event) => setNoteInput(event.target.value)}
                      className={`min-h-20 ${inputClass}`}
                      aria-label="Add note"
                    />
                    <button
                      type="button"
                      onClick={handleAddNote}
                      disabled={!hasNoteInput}
                      className={`self-start ${btnPrimary}`}
                    >
                      Add note
                    </button>
                  </div>
                )}
              </section>

              <section className={cardClass}>
                <h2 className={sectionTitleClass}>Goals</h2>
                <ul className="mb-3 space-y-1.5 text-sm text-slate-700">
                  {(project.goals ?? []).map((goal) => (
                    <li
                      key={goal}
                      className="flex items-start gap-3 rounded-lg border border-[oklch(88%_0.065_140)] bg-[oklch(97%_0.045_140)] px-3 py-1.5"
                    >
                      <span className="mt-2 size-1.5 shrink-0 rounded-full bg-[oklch(62%_0.17_145)]" />
                      <span className="min-w-0 flex-1 font-medium leading-6 text-[oklch(30%_0.07_150)]">
                        {goal}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleRemoveGoal(goal)}
                        className="inline-flex size-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600 focus:outline-none focus:ring-2 focus:ring-red-200"
                        aria-label={`Remove goal ${goal}`}
                      >
                        ×
                      </button>
                    </li>
                  ))}
                  {(!project.goals || project.goals.length === 0) && (
                    <li className="font-medium text-[oklch(50%_0.07_260)]">No goals yet.</li>
                  )}
                </ul>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <input
                    type="text"
                    placeholder="Add a goal"
                    value={goalInput}
                    onChange={(event) => setGoalInput(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") handleAddGoal();
                    }}
                    className={inputClass}
                  />
                  <button
                    type="button"
                    onClick={handleAddGoal}
                    disabled={!hasGoalInput}
                    className={btnPrimary}
                  >
                    Add goal
                  </button>
                </div>
              </section>

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
