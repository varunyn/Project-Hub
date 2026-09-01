from __future__ import annotations

import argparse
import json
from pathlib import Path

from .checks import check_project
from .config import load_config
from .discovery import discover_projects
from .release_intelligence import enrich_results_with_release_intelligence
from .reports import write_reports


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Generate local dependency update reports.")
    parser.add_argument("--config", default="config.yaml", help="Path to config.yaml")
    parser.add_argument("--progress", action="store_true", help="Emit enrichment progress as JSON lines")
    args = parser.parse_args(argv)
    try:
        config = load_config(Path(args.config))
        existing_roots = [root for root in config.scan_roots if root.exists()]
        if not existing_roots:
            raise ValueError("All scan roots are missing")
        callback = None
        if args.progress:
            callback = lambda event: print(
                json.dumps({"type": "dependency_report_progress", **event}),
                flush=True,
            )
        if callback:
            callback({"phase": "scanning", "completed": 0, "total": len(existing_roots)})
        projects = discover_projects(existing_roots, config.ignore_dirs)
        results = [check_project(project) for project in projects]
        if callback:
            callback({"phase": "scanning", "completed": len(existing_roots), "total": len(existing_roots)})

        def before_ai() -> None:
            if config.ai.enabled:
                write_reports(results, existing_roots, config.output_dir)

        enrich_results_with_release_intelligence(
            results,
            config,
            progress_callback=callback,
            before_ai_callback=before_ai,
        )
        paths = write_reports(results, existing_roots, config.output_dir)
    except Exception as exc:
        print(f"dependency_reporter: {exc}")
        return 2
    print(f"Wrote Markdown report: {paths['markdown']}")
    print(f"Wrote JSON report: {paths['json']}")
    return 0
