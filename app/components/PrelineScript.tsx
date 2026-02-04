"use client";

import { useEffect } from "react";

export default function PrelineScript() {
  useEffect(() => {
    let cancelled = false;
    (async () => {
      await import("preline/dist/index.js");
      if (cancelled) return;
      if (
        typeof window !== "undefined" &&
        window.HSStaticMethods &&
        typeof window.HSStaticMethods.autoInit === "function"
      ) {
        window.HSStaticMethods.autoInit();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      if (
        typeof window !== "undefined" &&
        window.HSStaticMethods &&
        typeof window.HSStaticMethods.autoInit === "function"
      ) {
        window.HSStaticMethods.autoInit();
      }
    }, 150);
    return () => clearTimeout(t);
  }, []);

  return null;
}
