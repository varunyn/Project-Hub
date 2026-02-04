"use client";

import Sidebar from "../components/Sidebar";
import { useProjects } from "../hooks/useProjects";

export const SIDEBAR_ID = "hs-sidebar-project-hub";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { projects, loading } = useProjects();

  return (
    <div className="flex h-screen min-h-screen bg-gray-50 overflow-hidden">
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

      <main className="flex-1 min-w-0 min-h-0 flex flex-col overflow-hidden relative bg-white border-l border-gray-200 min-h-screen shadow-[inset_2px_0_4px_0_rgba(0,0,0,0.04)]">
        <div className="dashboard-main-content flex-1 min-h-0 overflow-auto transition-[margin] duration-300">
          <button
            type="button"
            className="fixed top-4 left-4 z-[30] p-2 rounded-lg bg-white border border-gray-200 shadow-md text-gray-600 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-500"
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
