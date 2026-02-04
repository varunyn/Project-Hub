"use client";

import dynamic from "next/dynamic";

const PrelineScript = dynamic(() => import("./PrelineScript"), { ssr: false });

export default function PrelineScriptWrapper() {
  return <PrelineScript />;
}
