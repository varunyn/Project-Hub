import "server-only";

import fs from "node:fs";
import path from "node:path";

export interface DependencyReportAiPreferences {
  aiEnabled: boolean;
}

export interface DependencyReportAiAvailability {
  aiAvailable: boolean;
  defaultAiEnabled: boolean;
  maxPackages: number;
}

const defaultPreferences: DependencyReportAiPreferences = { aiEnabled: false };

function boolEnv(name: string, fallback: boolean): boolean {
  const value = process.env[name];
  return value === undefined ? fallback : value === "true";
}

function maxPackages(): number {
  const value = Number(process.env.DEPENDENCY_REPORT_RELEASE_MAX_PACKAGES);
  return Number.isFinite(value) && value > 0 ? value : 25;
}

function preferenceFilePath(): string {
  const dataDir = process.env.PROJECT_DATA_DIR || path.join(process.cwd(), "app", "data");
  return (
    process.env.DEPENDENCY_REPORT_AI_PREFERENCE_FILE ||
    path.join(dataDir, "dependency-report-ai-preferences.json")
  );
}

export function getDependencyReportAiAvailability(): DependencyReportAiAvailability {
  const available = boolEnv("DEPENDENCY_REPORT_AI_ENABLED", false);
  return { aiAvailable: available, defaultAiEnabled: available, maxPackages: maxPackages() };
}

export function getDependencyReportAiPreferences(): DependencyReportAiPreferences {
  try {
    const value = JSON.parse(
      fs.readFileSync(/* turbopackIgnore: true */ preferenceFilePath(), "utf8")
    ) as Partial<DependencyReportAiPreferences>;
    return {
      aiEnabled:
        typeof value.aiEnabled === "boolean" ? value.aiEnabled : defaultPreferences.aiEnabled,
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT")
      console.error("Failed to read dependency report AI preference:", error);
    return { aiEnabled: getDependencyReportAiAvailability().defaultAiEnabled };
  }
}

export function saveDependencyReportAiPreferences(
  aiEnabled: boolean
): DependencyReportAiPreferences {
  const preference = { aiEnabled };
  const file = preferenceFilePath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(preference, null, 2), "utf8");
  fs.renameSync(temporary, file);
  return preference;
}

export function resolveDependencyReportAiEnabled(requested?: boolean): boolean {
  const availability = getDependencyReportAiAvailability();
  const selected = requested ?? getDependencyReportAiPreferences().aiEnabled;
  if (selected && !availability.aiAvailable && requested !== undefined) {
    throw new Error(
      "AI suggestions are unavailable because AI is disabled for this Project Hub instance."
    );
  }
  return selected && availability.aiAvailable;
}
