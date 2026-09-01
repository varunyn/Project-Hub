export interface DependencyReleaseInfo {
  currentReleaseDate: string | null;
  latestReleaseDate: string | null;
  homepageUrl: string | null;
  repositoryUrl: string | null;
  changelogUrl: string | null;
  releaseNotesExcerpt: string | null;
  aiPriority: string | null;
  aiRisk: string | null;
  aiSuggestedAction: string | null;
  aiNotableChanges: string[];
  aiBreakingChanges: string[];
  aiEvidenceUrls: string[];
  aiSummary: string | null;
  aiWarning: string | null;
}

export interface DependencyUpdate {
  id: string;
  ecosystem: string;
  packageName: string;
  currentVersion: string;
  wantedVersion: string;
  latestVersion: string;
  dependencyType: string;
  releaseInfo: DependencyReleaseInfo;
}

export interface DependencyProject {
  path: string;
  ecosystems: string[];
  manifests: string[];
  warnings: string[];
  errors: string[];
  updates: DependencyUpdate[];
}

export interface DependencyUpdatesReport {
  status: "missing" | "ready";
  generatedAt: string | null;
  scanRoots: string[];
  reportFileName: string | null;
  command: string;
  canRunReporter: boolean;
  runMode: "host" | "server";
  enrichmentState:
    | "disabled"
    | "pending"
    | "in_progress"
    | "completed"
    | "partial"
    | "skipped"
    | null;
  enrichmentMetrics: DependencyReportEnrichmentMetrics;
  projects: DependencyProject[];
  totals: {
    projects: number;
    updates: number;
    warnings: number;
    errors: number;
  };
}

export interface DependencyReportEnrichmentMetrics {
  uniqueCandidates: number | null;
  cacheHits: number | null;
  requests: number | null;
  failures: number | null;
  skipped: number | null;
  promptTokens: number | null;
  completionTokens: number | null;
  reasoningTokens: number | null;
  totalTokens: number | null;
  requestDurationSeconds: number | null;
  aiDurationSeconds: number | null;
  releaseLookupSeconds: number | null;
  durationSeconds: number | null;
  model: string | null;
}
