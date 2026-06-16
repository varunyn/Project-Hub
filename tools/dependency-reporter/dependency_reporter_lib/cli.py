from __future__ import annotations

import argparse
from pathlib import Path

from .checks import check_project
from .config import load_config
from .discovery import discover_projects
from .release_intelligence import enrich_results_with_release_intelligence
from .reports import write_reports


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Generate local dependency update reports.")
    parser.add_argument("--config", default="config.yaml", help="Path to config.yaml")
    args = parser.parse_args(argv)
    try:
        config = load_config(Path(args.config))
        existing_roots = [root for root in config.scan_roots if root.exists()]
        if not existing_roots:
            raise ValueError("All scan roots are missing")
        projects = discover_projects(existing_roots, config.ignore_dirs)
        results = [check_project(project) for project in projects]
        enrich_results_with_release_intelligence(results, config)
        paths = write_reports(results, existing_roots, config.output_dir)
    except Exception as exc:
        print(f"dependency_reporter: {exc}")
        return 2
    print(f"Wrote Markdown report: {paths['markdown']}")
    print(f"Wrote JSON report: {paths['json']}")
    return 0
