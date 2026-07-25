from __future__ import annotations

import subprocess
import urllib.request

from dependency_reporter_lib.checks import check_project
from dependency_reporter_lib.cli import main
from dependency_reporter_lib.commands import COMMAND_TIMEOUT_SECONDS, _command_output_snippet, run_command
from dependency_reporter_lib.config import _parse_config_scalar, load_config
from dependency_reporter_lib.discovery import PYTHON_MANIFESTS, _walk, discover_projects
from dependency_reporter_lib.models import (
    AIConfig,
    CommandResult,
    Config,
    DependencyUpdate,
    Project,
    ProjectResult,
    ReleaseInfo,
    ReleaseIntelligenceConfig,
)
from dependency_reporter_lib.node_deps import collect_direct_node_dependencies
from dependency_reporter_lib.parsers import parse_node_outdated, parse_npm_outdated, parse_pip_outdated
from dependency_reporter_lib.python_deps import (
    collect_uv_locked_python_dependencies,
    _collect_pipfile_dependencies,
    _collect_pyproject_dependencies,
    _collect_requirements_dependencies,
    _extract_requirement_name,
    _extract_requirement_names,
    _load_toml,
    _normalize_package_name,
    _parse_minimal_toml,
    _parse_toml_scalar,
    collect_direct_python_dependencies,
)
from dependency_reporter_lib.release_intelligence import (
    TTLCache,
    _apply_ai_summary,
    _clean_repository_url,
    _extract_json_object,
    _first_pypi_release_date,
    _infer_changelog_url,
    _pick_project_url,
    _string_list,
    _strip_markup,
    enrich_results_with_release_intelligence,
    fetch_json_url,
    fetch_release_info,
    fetch_release_text,
    github_repository,
    parse_npm_release_metadata,
    parse_pypi_release_metadata,
    select_releases,
    summarize_update_with_ai,
)
from dependency_reporter_lib.reports import (
    _append_change_list,
    _append_updates_table,
    _append_upgrade_planning,
    _format_release_links,
    _render_json,
    _render_markdown,
    _render_update_json,
    write_reports,
)


__all__ = [
    "AIConfig",
    "COMMAND_TIMEOUT_SECONDS",
    "CommandResult",
    "Config",
    "DependencyUpdate",
    "PYTHON_MANIFESTS",
    "Project",
    "ProjectResult",
    "ReleaseInfo",
    "ReleaseIntelligenceConfig",
    "TTLCache",
    "check_project",
    "collect_direct_node_dependencies",
    "collect_direct_python_dependencies",
    "collect_uv_locked_python_dependencies",
    "discover_projects",
    "enrich_results_with_release_intelligence",
    "fetch_json_url",
    "fetch_release_info",
    "fetch_release_text",
    "github_repository",
    "load_config",
    "main",
    "parse_node_outdated",
    "parse_npm_outdated",
    "parse_npm_release_metadata",
    "parse_pip_outdated",
    "parse_pypi_release_metadata",
    "run_command",
    "select_releases",
    "summarize_update_with_ai",
    "write_reports",
]


if __name__ == "__main__":
    raise SystemExit(main())
    github_repository,
    select_releases,
