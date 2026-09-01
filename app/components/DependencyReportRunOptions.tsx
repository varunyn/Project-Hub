"use client";

import { useState } from "react";
import type {
  DependencyReportAiPreferences,
  DependencyReportJobStatus,
} from "../lib/dependencyUpdatesApi";

export function DependencyReportRunOptions({
  preferences,
  status,
  running,
  onPreferenceChange,
}: {
  preferences: DependencyReportAiPreferences | null;
  status: DependencyReportJobStatus | null;
  running: boolean;
  onPreferenceChange: (enabled: boolean) => Promise<unknown>;
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const enabled = preferences?.aiEnabled ?? preferences?.defaultAiEnabled ?? false;
  const unavailable = preferences ? !preferences.aiAvailable : false;
  const disabled = running || saving || unavailable || !preferences;
  const activeLabel =
    running && status
      ? `Report is running ${status.aiEnabled ? "with" : "without"} AI suggestions.`
      : null;

  async function handleChange(value: boolean) {
    setSaving(true);
    setSaveError(null);
    try {
      await onPreferenceChange(value);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Unable to save AI preference.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="relative w-full sm:w-auto">
      <button
        aria-expanded={open}
        className="min-h-8 rounded-md px-2 text-xs font-semibold text-slate-600 underline decoration-slate-300 underline-offset-4 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-300 disabled:cursor-not-allowed disabled:opacity-60"
        onClick={() => setOpen((value) => !value)}
        type="button"
      >
        {enabled ? "AI suggestions on" : "AI suggestions off"} · Options
      </button>
      {open && (
        <div className="absolute right-0 z-10 mt-1 w-80 max-w-[calc(100vw-2rem)] rounded-lg border border-slate-200 bg-white p-3 text-left shadow-lg ring-1 ring-slate-950/5">
          <label
            className={`flex items-start gap-2 text-sm font-semibold text-slate-800 ${disabled ? "cursor-not-allowed" : "cursor-pointer"}`}
          >
            <input
              checked={enabled}
              className="mt-0.5 size-4 accent-blue-700"
              disabled={disabled}
              onChange={(event) => handleChange(event.target.checked)}
              type="checkbox"
            />
            <span>Include AI suggestions</span>
          </label>
          <p className="mt-1 pl-6 text-xs leading-5 text-slate-500">
            {unavailable
              ? "AI suggestions are disabled for this Project Hub instance."
              : preferences
                ? `AI analysis applies to up to ${preferences.maxPackages} unique upgrades per report.`
                : "Loading AI availability…"}
          </p>
          {activeLabel && (
            <p className="mt-2 border-t border-slate-100 pt-2 text-xs font-semibold text-blue-700">
              {activeLabel}
            </p>
          )}
          {saveError && <p className="mt-2 text-xs font-semibold text-red-700">{saveError}</p>}
        </div>
      )}
    </div>
  );
}
