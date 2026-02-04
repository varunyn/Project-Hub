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
  devServerUrl?: string;
  startCommand?: string;
  docCount?: number;
}
