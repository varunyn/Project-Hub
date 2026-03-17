"use client";

import Sidebar from "../components/Sidebar";
import { useProjects } from "../hooks/useProjects";

export const SIDEBAR_ID = "hs-sidebar-project-hub";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { projects, loading } = useProjects();

  return (
    <div className="flex h-screen min-h-screen overflow-hidden bg-slate-50">
      <div
        id={SIDEBAR_ID}
        className="hs-overlay [--auto-close:lg] [--auto-close-equality-type:less-than] [--opened:lg] [--is-layout-affect:true] w-72 hs-overlay-open:translate-x-0 -translate-x-full transition-all duration-300 transform h-full hidden fixed top-0 start-0 bottom-0 z-[60] bg-slate-900 border-e border-slate-600/90 shadow-xl"
        role="dialog"
        tabIndex={-1}
        aria-label="Sidebar"
      >
        <div className="relative flex flex-col h-full max-h-full">
          <Sidebar projects={loading ? [] : projects} sidebarId={SIDEBAR_ID} />
        </div>
      </div>

      <main className="relative flex min-h-0 min-h-screen min-w-0 flex-1 flex-col overflow-hidden border-l border-slate-200/80 bg-white shadow-[inset_2px_0_4px_0_rgba(15,23,42,0.04)]">
        <div className="dashboard-main-content flex-1 min-h-0 overflow-auto transition-[margin] duration-300">
          <button
            type="button"
            className="fixed left-4 top-4 z-[30] rounded-lg border border-slate-200/80 bg-white p-2 text-slate-600 shadow-sm ring-1 ring-slate-900/5 transition-colors hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-400/50 focus:ring-offset-2"
            aria-haspopup="dialog"
            aria-expanded="false"
            aria-controls={SIDEBAR_ID}
            aria-label="Toggle sidebar"
            data-hs-overlay={`#${SIDEBAR_ID}`}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-6 w-6"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <div className="pt-2 pb-6 px-4 min-h-full pl-14">{children}</div>
        </div>
      </main>
    </div>
  );
}
