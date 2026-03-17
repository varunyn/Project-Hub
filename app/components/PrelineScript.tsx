"use client";

import { useEffect } from "react";

export default function PrelineScript() {
  const runPrelineAutoInit = () => {
    if (
      typeof window !== "undefined" &&
      window.HSStaticMethods &&
      typeof window.HSStaticMethods.autoInit === "function"
    ) {
      window.HSStaticMethods.autoInit();
    }
  };

  useEffect(() => {
    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    (async () => {
      await import("preline/dist/index.js");
      if (cancelled) return;
      runPrelineAutoInit();

      timeoutId = setTimeout(() => {
        runPrelineAutoInit();
      }, 150);
    })();

    return () => {
      cancelled = true;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, []);

  return null;
}
