import { randomUUID } from "node:crypto";
import type { Project, ProjectTask, TaskCreationInput, TaskPriority, TaskStatus } from "../types";
import {
  createGithubIssue,
  ensureGithubLabel,
  GithubApiError,
  getGithubIssue,
  isUncertainGithubCreateStatus,
  updateGithubIssueState,
} from "../utils/githubApi";
import {
  type GithubIssue,
  githubIssueStateForTask,
  parseGithubRepository,
  taskToGithubIssue,
} from "../utils/githubSync";
import { getProjects } from "../utils/projectUtils";
import {
  createTaskInLock,
  deleteTaskIfNoGithubReservation,
  getProjectTasks,
  TASK_PRIORITIES,
  TASK_STATUSES,
  updateTask,
  updateTaskIfSyncAttempt,
  updateTaskInLock,
} from "../utils/taskUtils";

export type TaskWorkflowErrorCode =
  | "invalid_task"
  | "project_not_found"
  | "task_not_found"
  | "task_not_linked"
  | "github_link_conflict"
  | "github_link_not_uncertain"
  | "github_not_configured"
  | "github_repository_not_configured"
  | "persistence_failed";

export interface TaskUpdateInput {
  projectId: string;
  taskId: string;
  changes: Record<string, unknown>;
}

export type GithubSynchronizationOutcome =
  | { status: "not-required" }
  | { status: "synced"; completedAt: string }
  | { status: "failed"; attemptedAt: string; error: string };

export interface GithubStatusAdapter {
  mirrorStatus(task: ProjectTask, project: Project): Promise<void>;
}

export interface GithubLinkAdapter extends GithubStatusAdapter {
  createIssue(task: ProjectTask, project: Project): Promise<GithubIssue>;
}

export type GithubLinkOutcome =
  | {
      status: "linked" | "already-linked";
      task: ProjectTask;
      githubSynchronization?: GithubSynchronizationOutcome;
    }
  | {
      status: "partial" | "uncertain" | "failed" | "conflict";
      task: ProjectTask;
      issueNumber?: number;
      issueUrl?: string;
      error?: string;
    };

export interface TaskWorkflowUpdateResult {
  task: ProjectTask;
  githubSynchronization: GithubSynchronizationOutcome;
}

export interface GithubStatusRetryInput {
  projectId: string;
  taskId: string;
}

export type GithubLinkResolution =
  | { action: "attach"; issueNumber: number; issueUrl: string }
  | { action: "confirm-none" };

export class TaskWorkflowError extends Error {
  readonly code: TaskWorkflowErrorCode;

  constructor(code: TaskWorkflowErrorCode, message: string) {
    super(message);
    this.name = "TaskWorkflowError";
    this.code = code;
  }
}

export interface TaskWorkflowDependencies {
  now?: () => string;
  generateId?: () => string;
  githubAdapter?: GithubStatusAdapter;
  githubLinkAdapter?: GithubLinkAdapter;
  /** Test-only seam used to exercise a failure between durable identity and attachment. */
  beforeGithubLinkAttachment?: () => void | Promise<void>;
}

type StoredTaskWithReservationId = ProjectTask & { _githubLinkReservationId?: string };

export class GithubIssueCreationError extends Error {
  readonly outcome: "definite-failure" | "uncertain";
  constructor(outcome: "definite-failure" | "uncertain", message: string) {
    super(message);
    this.name = "GithubIssueCreationError";
    this.outcome = outcome;
  }
}

function safeGithubError(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  if (message.includes("not configured")) return "GitHub synchronization is not configured";
  const status = message.match(/\b(?:status|HTTP)\s*[:(]?\s*(\d{3})\b/i)?.[1];
  return status
    ? `GitHub synchronization failed (HTTP ${status})`
    : "GitHub synchronization failed";
}

function withoutInternalWorkflowState(task: ProjectTask): ProjectTask {
  const {
    _githubSyncAttemptId: _syncAttempt,
    _githubLinkReservationId: _linkReservation,
    ...publicTask
  } = task as ProjectTask & {
    _githubSyncAttemptId?: string;
    _githubLinkReservationId?: string;
  };
  return publicTask;
}

const productionGithubAdapter: GithubLinkAdapter = {
  async createIssue(task, project) {
    if (!(project.githubUrl && process.env.GITHUB_TOKEN))
      throw new GithubIssueCreationError(
        "definite-failure",
        "GitHub synchronization is not configured"
      );
    let owner: string;
    let repo: string;
    try {
      ({ owner, repo } = parseGithubRepository(project.githubUrl));
    } catch {
      throw new GithubIssueCreationError(
        "definite-failure",
        "GitHub repository configuration is invalid"
      );
    }
    try {
      return await createGithubIssue(
        owner,
        repo,
        process.env.GITHUB_TOKEN,
        taskToGithubIssue(task)
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "GitHub issue creation failed";
      // Some responses can mean GitHub processed the request but the response was lost.
      if (error instanceof GithubApiError)
        throw new GithubIssueCreationError(
          isUncertainGithubCreateStatus(error.status) ? "uncertain" : "definite-failure",
          message
        );
      throw new GithubIssueCreationError("uncertain", message);
    }
  },
  async mirrorStatus(task, project) {
    if (!(project.githubUrl && task.githubIssueNumber))
      throw new Error("GitHub synchronization is not configured");
    const token = process.env.GITHUB_TOKEN;
    if (!token) throw new Error("GitHub synchronization is not configured");
    const { owner, repo } = parseGithubRepository(project.githubUrl);
    await ensureGithubLabel(owner, repo, token, `status:${task.status}`, "ededed");
    const issue = await getGithubIssue(owner, repo, task.githubIssueNumber, token);
    const labels = issue.labels
      .map((label) => label.name)
      .filter((label) => !label.startsWith("status:"));
    labels.push(`status:${task.status}`);
    await updateGithubIssueState(
      owner,
      repo,
      task.githubIssueNumber,
      token,
      githubIssueStateForTask(task.status),
      labels
    );
  },
};

function isTaskStatus(value: unknown): value is TaskStatus {
  return typeof value === "string" && TASK_STATUSES.includes(value as TaskStatus);
}

function isTaskPriority(value: unknown): value is TaskPriority {
  return typeof value === "string" && TASK_PRIORITIES.includes(value as TaskPriority);
}

function invalidTask(message: string): never {
  throw new TaskWorkflowError("invalid_task", message);
}

function validateLabels(labels: unknown): labels is string[] {
  return (
    Array.isArray(labels) &&
    labels.length <= 10 &&
    labels.every((label) => typeof label === "string" && label.length <= 40)
  );
}

const updateFields = new Set([
  "title",
  "description",
  "status",
  "priority",
  "assigneeId",
  "labels",
  "dueDate",
  "position",
]);

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: validation is intentionally atomic across the complete update allowlist.
function validateUpdate(
  changes: Record<string, unknown>
): Partial<Omit<ProjectTask, "id" | "projectId" | "createdAt" | "updatedAt">> {
  if (!changes || Object.keys(changes).length === 0)
    invalidTask("at least one task change is required");
  for (const field of Object.keys(changes)) {
    if (!updateFields.has(field)) invalidTask(`field ${field} cannot be updated`);
  }
  const normalized: Partial<Omit<ProjectTask, "id" | "projectId" | "createdAt" | "updatedAt">> = {};
  if ("title" in changes) {
    if (typeof changes.title !== "string" || !changes.title.trim() || changes.title.length > 200)
      invalidTask("invalid title");
    normalized.title = changes.title.trim();
  }
  if ("description" in changes) {
    if (typeof changes.description !== "string" || changes.description.length > 5000)
      invalidTask("invalid description");
    normalized.description = changes.description;
  }
  if ("status" in changes) {
    if (!isTaskStatus(changes.status)) invalidTask("invalid task status");
    normalized.status = changes.status;
  }
  if ("priority" in changes) {
    if (!isTaskPriority(changes.priority)) invalidTask("invalid task priority");
    normalized.priority = changes.priority;
  }
  if ("assigneeId" in changes) {
    if (typeof changes.assigneeId !== "string" || changes.assigneeId.length > 100)
      invalidTask("invalid assigneeId");
    normalized.assigneeId = changes.assigneeId;
  }
  if ("labels" in changes) {
    if (!validateLabels(changes.labels)) invalidTask("invalid labels");
    normalized.labels = [...changes.labels];
  }
  if ("dueDate" in changes) {
    if (typeof changes.dueDate !== "string" || !/^$|^\d{4}-\d{2}-\d{2}$/.test(changes.dueDate))
      invalidTask("invalid dueDate");
    normalized.dueDate = changes.dueDate;
  }
  if ("position" in changes) {
    if (!Number.isInteger(changes.position) || Number(changes.position) < 0)
      invalidTask("invalid position");
    normalized.position = Number(changes.position);
  }
  return normalized;
}

function validateAndNormalize(input: TaskCreationInput): Required<TaskCreationInput> {
  if (!input || typeof input.projectId !== "string" || !input.projectId.trim()) {
    invalidTask("projectId is required");
  }
  if (typeof input.title !== "string") invalidTask("title is required");
  const title = input.title.trim();
  if (!title || title.length > 200) invalidTask("title must be between 1 and 200 characters");

  const status = input.status ?? "todo";
  const priority = input.priority ?? "medium";
  if (!isTaskStatus(status)) invalidTask("invalid task status");
  if (!isTaskPriority(priority)) invalidTask("invalid task priority");

  const description = input.description ?? "";
  const assigneeId = input.assigneeId ?? "";
  const labels = input.labels ?? [];
  const dueDate = input.dueDate ?? "";
  if (typeof description !== "string" || description.length > 5000)
    invalidTask("invalid description");
  if (typeof assigneeId !== "string" || assigneeId.length > 100) invalidTask("invalid assigneeId");
  if (!validateLabels(labels)) invalidTask("invalid labels");
  if (typeof dueDate !== "string" || !/^$|^\d{4}-\d{2}-\d{2}$/.test(dueDate))
    invalidTask("invalid dueDate");

  return {
    projectId: input.projectId,
    title,
    description,
    status,
    priority,
    assigneeId,
    labels: [...labels],
    dueDate,
  };
}

export class TaskWorkflow {
  private readonly now: () => string;
  private readonly generateId: () => string;
  private readonly githubAdapter: GithubStatusAdapter;
  private readonly githubLinkAdapter: GithubLinkAdapter;
  private readonly beforeGithubLinkAttachment?: () => void | Promise<void>;
  private readonly syncQueues = new Map<string, Promise<void>>();

  constructor(dependencies: TaskWorkflowDependencies = {}) {
    this.now = dependencies.now ?? (() => new Date().toISOString());
    this.generateId = dependencies.generateId ?? randomUUID;
    this.githubAdapter = dependencies.githubAdapter ?? productionGithubAdapter;
    this.githubLinkAdapter = dependencies.githubLinkAdapter ?? productionGithubAdapter;
    this.beforeGithubLinkAttachment = dependencies.beforeGithubLinkAttachment;
  }

  private async synchronizeGithubStatus(
    projectId: string,
    taskId: string,
    task: ProjectTask,
    attemptId: string,
    attemptedAt: string
  ): Promise<TaskWorkflowUpdateResult> {
    const project = getProjects().find((item) => item.id === projectId);
    if (!project) throw new TaskWorkflowError("project_not_found", "Project not found");
    const key = `${projectId}:${taskId}`;
    const previous = this.syncQueues.get(key) ?? Promise.resolve();
    const current = previous.then(() => this.githubAdapter.mirrorStatus(task, project));
    const settled = current.then(
      () => undefined,
      () => undefined
    );
    const cleaned = settled.then(() => {
      if (this.syncQueues.get(key) === cleaned) this.syncQueues.delete(key);
    });
    this.syncQueues.set(key, cleaned);

    try {
      await current;
      const completedAt = this.now();
      const synced = await updateTaskIfSyncAttempt(projectId, taskId, attemptId, {
        githubSynchronization: { state: "synced", attemptedAt, completedAt },
        _githubSyncAttemptId: undefined,
      } as Partial<ProjectTask>);
      const latest =
        synced ?? getProjectTasks(projectId).find((item) => item.id === taskId) ?? task;
      return {
        task: withoutInternalWorkflowState(latest),
        githubSynchronization: { status: "synced", completedAt },
      };
    } catch (error) {
      const safeError = safeGithubError(error);
      const failed = await updateTaskIfSyncAttempt(projectId, taskId, attemptId, {
        githubSynchronization: { state: "failed", attemptedAt, error: safeError },
        _githubSyncAttemptId: undefined,
      } as Partial<ProjectTask>);
      const latest =
        failed ?? getProjectTasks(projectId).find((item) => item.id === taskId) ?? task;
      return {
        task: withoutInternalWorkflowState(latest),
        githubSynchronization: { status: "failed", attemptedAt, error: safeError },
      };
    }
  }

  /** Create a fully initialized Task belonging to an existing Project. */
  async createTask(input: TaskCreationInput): Promise<ProjectTask> {
    const normalized = validateAndNormalize(input);
    if (!getProjects().some((project) => project.id === normalized.projectId)) {
      throw new TaskWorkflowError("project_not_found", "Project not found");
    }
    try {
      return await createTaskInLock((tasks) => {
        const now = this.now();
        const position = tasks.filter(
          (task) => task.projectId === normalized.projectId && task.status === normalized.status
        ).length;
        return {
          id: this.generateId(),
          projectId: normalized.projectId,
          title: normalized.title,
          description: normalized.description,
          status: normalized.status,
          priority: normalized.priority,
          assigneeId: normalized.assigneeId,
          labels: normalized.labels,
          dueDate: normalized.dueDate,
          position,
          createdAt: now,
          updatedAt: now,
        };
      });
    } catch (error) {
      if (error instanceof TaskWorkflowError) throw error;
      throw new TaskWorkflowError("persistence_failed", "Unable to persist task");
    }
  }

  async updateTask(input: TaskUpdateInput): Promise<TaskWorkflowUpdateResult> {
    if (typeof input?.projectId !== "string" || !input.projectId)
      throw new TaskWorkflowError("project_not_found", "Project not found");
    if (!getProjects().some((project) => project.id === input.projectId))
      throw new TaskWorkflowError("project_not_found", "Project not found");
    const changes = validateUpdate(input.changes);
    const existing = getProjectTasks(input.projectId).find((task) => task.id === input.taskId);
    if (!existing) throw new TaskWorkflowError("task_not_found", "Task not found");
    const statusChanged = "status" in changes && changes.status !== existing.status;
    const linked = typeof existing.githubIssueNumber === "number";
    const attemptId = statusChanged && linked ? this.generateId() : undefined;
    const attemptedAt = statusChanged && linked ? this.now() : undefined;
    const persistedChanges = attemptId
      ? {
          ...changes,
          githubSynchronization: { state: "pending" as const, attemptedAt },
          _githubSyncAttemptId: attemptId,
        }
      : changes;
    try {
      const updated = await updateTask(
        input.projectId,
        input.taskId,
        persistedChanges as Partial<ProjectTask>
      );
      if (!updated) throw new TaskWorkflowError("task_not_found", "Task not found");
      if (!(attemptId && attemptedAt)) {
        const publicTask = withoutInternalWorkflowState(updated);
        return { task: publicTask, githubSynchronization: { status: "not-required" } };
      }
      return this.synchronizeGithubStatus(
        input.projectId,
        input.taskId,
        updated,
        attemptId,
        attemptedAt
      );
    } catch (error) {
      if (error instanceof TaskWorkflowError) throw error;
      throw new TaskWorkflowError("persistence_failed", "Unable to persist task");
    }
  }

  /** Reserve, create, and attach one GitHub issue without allowing duplicate creation. */
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: the reservation state machine is intentionally kept atomic at this seam.
  async linkGithubIssue(projectId: string, taskId: string): Promise<GithubLinkOutcome> {
    if (!getProjects().some((project) => project.id === projectId))
      throw new TaskWorkflowError("project_not_found", "Project not found");
    const project = getProjects().find((item) => item.id === projectId);
    if (!project) throw new TaskWorkflowError("project_not_found", "Project not found");
    const reservationId = this.generateId();
    const reserved = await updateTaskInLock<{
      status: "already-linked" | "recover-known" | "conflict" | "reserved";
      reservationId?: string;
    }>(projectId, taskId, (task) => {
      if (typeof task.githubIssueNumber === "number")
        return { task, result: { status: "already-linked" as const } };
      const reservation = task.githubLinkReservation;
      if (reservation?.state === "partial" && typeof reservation.issueNumber === "number")
        return {
          task,
          result: {
            status: "recover-known" as const,
            reservationId: (task as StoredTaskWithReservationId)._githubLinkReservationId,
          },
        };
      if (reservation) return { task, result: { status: "conflict" as const } };
      return {
        task: {
          ...task,
          githubLinkReservation: { state: "creating", reservedAt: this.now() },
          _githubLinkReservationId: reservationId,
        },
        result: { status: "reserved" as const, reservationId },
      };
    });
    if (!reserved) throw new TaskWorkflowError("task_not_found", "Task not found");
    if (reserved.result.status === "already-linked")
      return { status: "already-linked", task: reserved.task };
    if (reserved.result.status === "conflict")
      return {
        status: "conflict",
        task: reserved.task,
        error: "GitHub issue linking is already in progress or needs resolution",
      };

    let issue: GithubIssue;
    const activeReservationId =
      reserved.result.status === "recover-known"
        ? (reserved.result.reservationId ?? reservationId)
        : reservationId;
    if (reserved.result.status === "recover-known") {
      issue = {
        number: reserved.task.githubLinkReservation?.issueNumber as number,
        html_url: reserved.task.githubLinkReservation?.issueUrl ?? "",
        title: reserved.task.title,
        body: reserved.task.description,
        state: "open",
        labels: [],
      };
    } else {
      if (this.githubLinkAdapter === productionGithubAdapter && !project.githubUrl) {
        await updateTaskInLock(projectId, taskId, (task) => {
          if (task._githubLinkReservationId !== reservationId) return null;
          const {
            githubLinkReservation: _reservation,
            _githubLinkReservationId: _id,
            ...cleared
          } = task;
          return { task: cleared, result: undefined };
        });
        throw new TaskWorkflowError(
          "github_repository_not_configured",
          "Add a GitHub repository URL to this project first"
        );
      }
      if (this.githubLinkAdapter === productionGithubAdapter && !process.env.GITHUB_TOKEN) {
        await updateTaskInLock(projectId, taskId, (task) => {
          if (task._githubLinkReservationId !== reservationId) return null;
          const {
            githubLinkReservation: _reservation,
            _githubLinkReservationId: _id,
            ...cleared
          } = task;
          return { task: cleared, result: undefined };
        });
        throw new TaskWorkflowError("github_not_configured", "Set GITHUB_TOKEN to use GitHub sync");
      }
      try {
        issue = await this.githubLinkAdapter.createIssue(reserved.task, project);
      } catch (error) {
        const uncertain =
          error instanceof GithubIssueCreationError ? error.outcome === "uncertain" : true;
        const safeError = safeGithubError(error);
        const failed = await updateTaskInLock(projectId, taskId, (task) => {
          if (task._githubLinkReservationId !== reservationId) return null;
          return {
            task: uncertain
              ? {
                  ...task,
                  githubLinkReservation: {
                    ...(task.githubLinkReservation ?? { reservedAt: this.now() }),
                    state: "uncertain" as const,
                  },
                }
              : (() => {
                  const {
                    githubLinkReservation: _reservation,
                    _githubLinkReservationId: _id,
                    ...cleared
                  } = task;
                  return cleared;
                })(),
            result: undefined,
          };
        });
        return {
          status: uncertain ? "uncertain" : "failed",
          task: failed?.task ?? reserved.task,
          error: safeError,
        };
      }
    }

    // Persist the remote identity while the reservation is still present. If the
    // following attachment write fails, the known partial can be recovered safely.
    const known = await updateTaskInLock<undefined>(projectId, taskId, (task) => {
      if (task._githubLinkReservationId !== activeReservationId) return null;
      return {
        task: {
          ...task,
          githubLinkReservation: {
            state: "partial",
            reservedAt: task.githubLinkReservation?.reservedAt ?? this.now(),
            issueNumber: issue.number,
            issueUrl: issue.html_url,
          },
          _githubLinkReservationId: activeReservationId,
        },
        result: undefined,
      };
    });
    if (!known)
      return {
        status: "partial",
        task: reserved.task,
        issueNumber: issue.number,
        issueUrl: issue.html_url,
      };
    let attached: Awaited<ReturnType<typeof updateTaskInLock>>;
    try {
      await this.beforeGithubLinkAttachment?.();
      attached = await updateTaskInLock<undefined>(projectId, taskId, (task) => {
        if (
          task._githubLinkReservationId !== activeReservationId ||
          task.githubLinkReservation?.issueNumber !== issue.number
        )
          return null;
        const {
          githubLinkReservation: _reservation,
          _githubLinkReservationId: _id,
          ...base
        } = task;
        return {
          task: { ...base, githubIssueNumber: issue.number, githubIssueUrl: issue.html_url },
          result: undefined,
        };
      });
    } catch {
      return {
        status: "partial",
        task: known.task,
        issueNumber: issue.number,
        issueUrl: issue.html_url,
        error: "GitHub issue was created but local linking needs recovery",
      };
    }
    if (!attached)
      return {
        status: "partial",
        task: known.task,
        issueNumber: issue.number,
        issueUrl: issue.html_url,
      };
    const attemptId = this.generateId();
    const attemptedAt = this.now();
    const pending = await updateTask(projectId, taskId, {
      githubSynchronization: { state: "pending", attemptedAt },
      _githubSyncAttemptId: attemptId,
    } as Partial<ProjectTask>);
    if (!pending) return { status: "linked", task: attached.task };
    const synced = await this.synchronizeGithubStatus(
      projectId,
      taskId,
      pending,
      attemptId,
      attemptedAt
    );
    return {
      status: "linked",
      task: synced.task,
      githubSynchronization: synced.githubSynchronization,
    };
  }

  async deleteTask(projectId: string, taskId: string): Promise<ProjectTask> {
    if (!getProjects().some((project) => project.id === projectId))
      throw new TaskWorkflowError("project_not_found", "Project not found");
    const existing = getProjectTasks(projectId).find((task) => task.id === taskId);
    if (!existing) throw new TaskWorkflowError("task_not_found", "Task not found");
    try {
      const deletion = await deleteTaskIfNoGithubReservation(projectId, taskId);
      if (deletion === "reserved")
        throw new TaskWorkflowError(
          "github_link_conflict",
          "Resolve the GitHub issue link before deleting this Task"
        );
      if (deletion === "missing") throw new TaskWorkflowError("task_not_found", "Task not found");
      return existing;
    } catch (error) {
      if (error instanceof TaskWorkflowError) throw error;
      throw new TaskWorkflowError("persistence_failed", "Unable to persist task");
    }
  }

  /** Retry synchronization from the Task's current local status. */
  async retryGithubStatus(input: GithubStatusRetryInput): Promise<TaskWorkflowUpdateResult> {
    if (typeof input?.projectId !== "string" || !input.projectId)
      throw new TaskWorkflowError("project_not_found", "Project not found");
    if (!getProjects().some((project) => project.id === input.projectId))
      throw new TaskWorkflowError("project_not_found", "Project not found");
    const existing = getProjectTasks(input.projectId).find((task) => task.id === input.taskId);
    if (!existing) throw new TaskWorkflowError("task_not_found", "Task not found");
    if (typeof existing.githubIssueNumber !== "number")
      throw new TaskWorkflowError("task_not_linked", "Task is not linked to a GitHub issue");

    const attemptId = this.generateId();
    const attemptedAt = this.now();
    try {
      // Reload immediately before this write; the persisted attempt fence makes
      // every older completion harmless if a newer status arrives concurrently.
      const pending = await updateTask(input.projectId, input.taskId, {
        githubSynchronization: { state: "pending", attemptedAt },
        _githubSyncAttemptId: attemptId,
      } as Partial<ProjectTask>);
      if (!pending) throw new TaskWorkflowError("task_not_found", "Task not found");
      return this.synchronizeGithubStatus(
        input.projectId,
        input.taskId,
        pending,
        attemptId,
        attemptedAt
      );
    } catch (error) {
      if (error instanceof TaskWorkflowError) throw error;
      throw new TaskWorkflowError("persistence_failed", "Unable to persist task");
    }
  }

  /** Resolve an uncertain issue creation without ever creating another issue. */
  async resolveGithubLink(
    projectId: string,
    taskId: string,
    resolution: GithubLinkResolution
  ): Promise<TaskWorkflowUpdateResult | { task: ProjectTask; resolution: "cleared" }> {
    const project = getProjects().find((item) => item.id === projectId);
    if (!project) throw new TaskWorkflowError("project_not_found", "Project not found");
    const existing = getProjectTasks(projectId).find((task) => task.id === taskId);
    if (!existing) throw new TaskWorkflowError("task_not_found", "Task not found");
    const reservation = existing.githubLinkReservation;
    if (reservation?.state !== "uncertain")
      throw new TaskWorkflowError(
        "github_link_not_uncertain",
        "This Task does not have an uncertain GitHub link to resolve"
      );

    if (resolution?.action === "attach") {
      if (
        !Number.isInteger(resolution.issueNumber) ||
        resolution.issueNumber < 1 ||
        typeof resolution.issueUrl !== "string"
      )
        invalidTask("a positive issue number and GitHub issue URL are required");
      let repository: { owner: string; repo: string };
      let issueUrl: URL;
      try {
        repository = parseGithubRepository(project.githubUrl ?? "");
        issueUrl = new URL(resolution.issueUrl);
      } catch {
        invalidTask("the GitHub issue URL is invalid");
      }
      const parts = issueUrl.pathname.split("/").filter(Boolean);
      if (
        issueUrl.protocol !== "https:" ||
        issueUrl.hostname !== "github.com" ||
        parts.length !== 4 ||
        parts[0] !== repository.owner ||
        parts[1] !== repository.repo ||
        parts[2] !== "issues" ||
        parts[3] !== String(resolution.issueNumber)
      )
        invalidTask("the GitHub issue URL must match this project's repository and issue number");

      const attached = await updateTaskInLock<undefined>(projectId, taskId, (task) => {
        if (task.githubLinkReservation?.state !== "uncertain") return null;
        const {
          githubLinkReservation: _reservation,
          _githubLinkReservationId: _id,
          ...base
        } = task;
        return {
          task: {
            ...base,
            githubIssueNumber: resolution.issueNumber,
            githubIssueUrl: resolution.issueUrl,
          },
          result: undefined,
        };
      });
      if (!attached)
        throw new TaskWorkflowError(
          "github_link_conflict",
          "The GitHub link changed before it could be resolved"
        );
      const attemptId = this.generateId();
      const attemptedAt = this.now();
      const pending = await updateTask(projectId, taskId, {
        githubSynchronization: { state: "pending", attemptedAt },
        _githubSyncAttemptId: attemptId,
      } as Partial<ProjectTask>);
      if (!pending) throw new TaskWorkflowError("task_not_found", "Task not found");
      return this.synchronizeGithubStatus(projectId, taskId, pending, attemptId, attemptedAt);
    }

    if (resolution?.action !== "confirm-none") invalidTask("a GitHub link resolution is required");
    const cleared = await updateTaskInLock<undefined>(projectId, taskId, (task) => {
      if (task.githubLinkReservation?.state !== "uncertain") return null;
      const { githubLinkReservation: _reservation, _githubLinkReservationId: _id, ...base } = task;
      return { task: base, result: undefined };
    });
    if (!cleared)
      throw new TaskWorkflowError(
        "github_link_conflict",
        "The GitHub link changed before it could be resolved"
      );
    return { task: cleared.task, resolution: "cleared" };
  }
}

export const taskWorkflow = new TaskWorkflow();

export async function createTask(input: TaskCreationInput): Promise<ProjectTask> {
  return taskWorkflow.createTask(input);
}

/** Named workflow operation used by transport adapters. */
export const createTaskWorkflow = createTask;

export async function updateTaskWorkflow(
  input: TaskUpdateInput
): Promise<TaskWorkflowUpdateResult> {
  return taskWorkflow.updateTask(input);
}

export async function deleteTaskWorkflow(projectId: string, taskId: string): Promise<ProjectTask> {
  return taskWorkflow.deleteTask(projectId, taskId);
}

export async function retryGithubStatusWorkflow(
  input: GithubStatusRetryInput
): Promise<TaskWorkflowUpdateResult> {
  return taskWorkflow.retryGithubStatus(input);
}

export async function linkGithubIssueWorkflow(
  projectId: string,
  taskId: string
): Promise<GithubLinkOutcome> {
  return taskWorkflow.linkGithubIssue(projectId, taskId);
}

export async function resolveGithubLinkWorkflow(
  projectId: string,
  taskId: string,
  resolution: GithubLinkResolution
): Promise<TaskWorkflowUpdateResult | { task: ProjectTask; resolution: "cleared" }> {
  return taskWorkflow.resolveGithubLink(projectId, taskId, resolution);
}
