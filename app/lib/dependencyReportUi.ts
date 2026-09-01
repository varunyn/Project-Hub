import type { DependencyReportEnrichmentMetrics } from "./dependencyReportTypes";

export type DependencyReportPhase = "scanning" | "release_lookup" | "ai_enrichment" | "finalizing";

export function dependencyPhaseLabel(phase: DependencyReportPhase | null | undefined): string {
  switch (phase) {
    case "scanning":
      return "Scanning projects";
    case "release_lookup":
      return "Looking up releases";
    case "ai_enrichment":
      return "Enriching with AI";
    case "finalizing":
      return "Finalizing report";
    default:
      return "Preparing report";
  }
}

export function dependencyEnrichmentLabel(
  state: string | null | undefined,
  aiEnabled = false
): string {
  switch (state) {
    case "disabled":
      return "AI disabled";
    case "pending":
      return "AI pending";
    case "in_progress":
      return "AI in progress";
    case "completed":
      return "AI completed";
    case "partial":
      return "AI partial";
    case "skipped":
      return "AI skipped";
    default:
      return aiEnabled ? "AI status unavailable" : "AI disabled";
  }
}

export function dependencyProgressLabel(
  phase: DependencyReportPhase | null | undefined,
  completed: number | null | undefined,
  total: number | null | undefined
): string {
  if (!total || completed === null || completed === undefined) return "";
  const noun =
    phase === "scanning"
      ? "scan roots"
      : phase === "release_lookup"
        ? "dependencies"
        : phase === "ai_enrichment"
          ? "candidates"
          : "steps";
  return `${completed} of ${total} ${noun}`;
}

export function formatMetric(value: number | null | undefined, suffix = ""): string {
  return value === null || value === undefined ? "—" : `${value}${suffix}`;
}

export function formatSeconds(value: number | null | undefined): string {
  return value === null || value === undefined ? "—" : `${value.toFixed(1)}s`;
}

export function enrichmentMetricSummary(metrics: DependencyReportEnrichmentMetrics): string[] {
  return [
    `Candidates ${formatMetric(metrics.uniqueCandidates)}`,
    `Requests ${formatMetric(metrics.requests)}`,
    `Cache hits ${formatMetric(metrics.cacheHits)}`,
    `Failures ${formatMetric(metrics.failures)}`,
    `Tokens ${formatMetric(metrics.totalTokens)}`,
    `AI time ${formatSeconds(metrics.aiDurationSeconds)}`,
    `Release lookup ${formatSeconds(metrics.releaseLookupSeconds)}`,
    `Total ${formatSeconds(metrics.durationSeconds)}`,
  ];
}
