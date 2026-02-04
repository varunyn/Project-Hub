"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Project } from "../types";

const RECENT_STORAGE_KEY = "project-hub-recent";
const RECENT_MAX = 10;

function getRecentIds(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(RECENT_STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as string[]) : [];
    return Array.isArray(parsed) ? parsed.slice(-RECENT_MAX) : [];
  } catch {
    return [];
  }
}

export function pushRecentProjectId(id: string): void {
  if (typeof window === "undefined") return;
  try {
    const ids = getRecentIds();
    const next = [...ids.filter((x) => x !== id), id].slice(-RECENT_MAX);
    localStorage.setItem(RECENT_STORAGE_KEY, JSON.stringify(next));
  } catch {}
}

interface SidebarProps {
  projects: Project[];
  sidebarId: string;
}

function activeThisWeek(projects: Project[]): number {
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  return projects.filter((p) => new Date(p.lastUpdated) >= weekAgo).length;
}

function stalled(projects: Project[]): number {
  const now = new Date();
  const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
  return projects.filter((p) => new Date(p.lastUpdated) < twoWeeksAgo || p.status === "archived")
    .length;
}

export default function Sidebar({ projects, sidebarId }: SidebarProps) {
  const pathname = usePathname();
  const pinned = projects.filter((p) => p.pinned);
  const recentIds = getRecentIds();
  const recent = recentIds
    .map((id) => projects.find((p) => p.id === id))
    .filter(Boolean) as Project[];
  const activeCount = activeThisWeek(projects);
  const stalledCount = stalled(projects);

  return (
    <>
      <header className="shrink-0 p-4 flex justify-between items-center gap-x-2 border-b border-slate-700/80">
        <div className="min-w-0">
          <h2 className="font-semibold text-white text-base tracking-tight">Project Dashboard</h2>
          <Link
            href="/"
            className="mt-1.5 flex items-center gap-2 text-sm text-slate-400 hover:text-slate-200 transition-colors focus:outline-none focus:opacity-80"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-4 w-4 shrink-0"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
              />
            </svg>
            <span className="truncate">Projects</span>
          </Link>
        </div>
        <div className="shrink-0 -me-2">
          <button
            type="button"
            className="flex justify-center items-center size-8 rounded-lg text-slate-400 hover:bg-slate-700/60 hover:text-white transition-colors focus:outline-none focus:ring-2 focus:ring-slate-500"
            aria-label="Close sidebar"
            data-hs-overlay={`#${sidebarId}`}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </header>

      <nav className="flex-1 min-h-0 overflow-y-auto p-4 space-y-6 [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-thumb]:rounded [&::-webkit-scrollbar-track]:bg-slate-800/50 [&::-webkit-scrollbar-thumb]:bg-slate-600">
        {pinned.length > 0 && (
          <section>
            <h3 className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-2 px-2">
              Pinned
            </h3>
            <ul className="space-y-0.5">
              {pinned.map((p) => (
                <li key={p.id}>
                  <Link
                    href={`/projects/${p.id}`}
                    className={`flex items-center gap-2.5 text-sm py-2 px-3 rounded-lg transition-colors ${
                      pathname === `/projects/${p.id}`
                        ? "bg-slate-700/70 text-white"
                        : "text-slate-300 hover:bg-slate-800/80 hover:text-white"
                    }`}
                  >
                    <span className="text-amber-400 shrink-0" aria-hidden>
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="h-4 w-4"
                        viewBox="0 0 24 24"
                        fill="currentColor"
                      >
                        <path d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                      </svg>
                    </span>
                    <span className="truncate">{p.name}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
        {recent.length > 0 && (
          <section>
            <h3 className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-2 px-2">
              Recent
            </h3>
            <ul className="space-y-0.5">
              {recent.map((p) => (
                <li key={p.id}>
                  <Link
                    href={`/projects/${p.id}`}
                    className={`flex items-center gap-2.5 text-sm py-2 px-3 rounded-lg transition-colors ${
                      pathname === `/projects/${p.id}`
                        ? "bg-slate-700/70 text-white"
                        : "text-slate-300 hover:bg-slate-800/80 hover:text-white"
                    }`}
                  >
                    <span className="shrink-0 w-2 h-2 rounded-full bg-slate-500" aria-hidden />
                    <span className="truncate">{p.name}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
        <section>
          <h3 className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-2 px-2">
            Smart Groups
          </h3>
          <ul className="space-y-0.5">
            <li>
              <span className="flex items-center justify-between text-sm py-2 px-3 rounded-lg text-slate-300 hover:bg-slate-800/60 transition-colors">
                Active this week
                <span className="text-slate-500 tabular-nums font-medium">{activeCount}</span>
              </span>
            </li>
            <li>
              <span className="flex items-center justify-between text-sm py-2 px-3 rounded-lg text-slate-300 hover:bg-slate-800/60 transition-colors">
                Stalled
                <span className="text-slate-500 tabular-nums font-medium">{stalledCount}</span>
              </span>
            </li>
          </ul>
        </section>
      </nav>
    </>
  );
}
