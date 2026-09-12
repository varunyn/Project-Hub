export interface Project {
  id: string;
  name: string;
  path: string;
  techStack: string[];
  dateCreated: string;
  lastUpdated: string;
  readmePreview: string;
  url?: string;
  githubUrl?: string;
  status: "in progress" | "completed" | "archived";
  pinned?: boolean;
  projectType?: string;
  tags?: string[];
  notes?: string;
  goals?: string[];
  mockCommits?: Array<{
    hash: string;
    subject: string;
    date: string;
  }>;
  devServerUrl?: string;
  startCommand?: string;
  docCount?: number;
}

export type TaskStatus = "backlog" | "todo" | "in-progress" | "review" | "done";
export type TaskPriority = "low" | "medium" | "high";

export type GithubSynchronizationState = "pending" | "synced" | "failed";

export interface GithubSynchronization {
  state: GithubSynchronizationState;
  attemptedAt: string;
  completedAt?: string;
  error?: string;
}

export type GithubLinkReservationState = "creating" | "uncertain" | "partial";

/** Durable state for an in-flight or recoverable GitHub issue link. */
export interface GithubLinkReservation {
  state: GithubLinkReservationState;
  reservedAt: string;
  issueNumber?: number;
  issueUrl?: string;
}

export interface ProjectTask {
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
  githubIssueNumber?: number;
  githubIssueUrl?: string;
  githubSynchronization?: GithubSynchronization;
  githubLinkReservation?: GithubLinkReservation;
}

/** The complete caller-neutral model accepted by the Task creation workflow. */
export interface TaskCreationInput {
  projectId: string;
  title: string;
  description?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  assigneeId?: string;
  labels?: string[];
  dueDate?: string;
}
