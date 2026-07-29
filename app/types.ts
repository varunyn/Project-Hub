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
}
