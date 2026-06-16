from __future__ import annotations

import json
import urllib.request
from pathlib import Path

from .commands import _command_output_snippet, run_command
from .models import DependencyUpdate, Project, ProjectResult
from .node_deps import collect_direct_node_dependencies
from .parsers import parse_node_outdated, parse_pip_outdated
from .python_deps import collect_direct_python_dependencies, collect_uv_locked_python_dependencies


def check_project(project: Project, runner=run_command, python_latest_version_fetcher=None) -> ProjectResult:
    result = ProjectResult(project=project)
    if "node" in project.ecosystems:
        _check_node_project(project, result, runner)
    if "python" in project.ecosystems:
        _check_python_project(project, result, runner, python_latest_version_fetcher or _fetch_latest_pypi_version)
    return result


def _check_node_project(project: Project, result: ProjectResult, runner) -> None:
    if (project.path / "yarn.lock").exists() and not (project.path / "package-lock.json").exists():
        result.warnings.append("Yarn project detected; Yarn checks are not supported in v1")
        return
    if (project.path / "pnpm-lock.yaml").exists() and not (project.path / "package-lock.json").exists():
        command = ["pnpm", "outdated", "--format", "json"]
        command_name = "pnpm outdated"
    else:
        command = ["npm", "outdated", "--json"]
        command_name = "npm outdated"
    command_result = runner(command, project.path)
    if command_result.returncode in (0, 1):
        try:
            result.updates.extend(parse_node_outdated(command_result.stdout, direct_dependencies=collect_direct_node_dependencies(project.path)))
        except json.JSONDecodeError as exc:
            result.errors.append(f"Could not parse {command_name} JSON: {exc}; {_command_output_snippet(command_result)}")
    else:
        result.errors.append(command_result.stderr.strip() or f"{command_name} failed with exit {command_result.returncode}")


def _check_python_project(project: Project, result: ProjectResult, runner, latest_version_fetcher) -> None:
    python_path = _find_local_python(project.path)
    if python_path is None:
        _check_python_lockfiles(project, result, latest_version_fetcher)
        return
    direct_dependencies = collect_direct_python_dependencies(project.path)
    if _is_uv_project(project.path):
        command = ["uv", "pip", "list", "--outdated", "--format=json", "--python", str(python_path)]
        command_name = "uv pip list"
    else:
        command = [str(python_path), "-m", "pip", "list", "--outdated", "--format=json"]
        command_name = "pip list"
    command_result = runner(command, project.path)
    if command_result.returncode == 0:
        try:
            result.updates.extend(parse_pip_outdated(command_result.stdout, direct_dependencies=direct_dependencies))
        except json.JSONDecodeError as exc:
            result.errors.append(f"Could not parse {command_name} outdated JSON: {exc}")
    else:
        result.errors.append(command_result.stderr.strip() or f"{command_name} failed with exit {command_result.returncode}")


def _check_python_lockfiles(project: Project, result: ProjectResult, latest_version_fetcher) -> None:
    direct_dependencies = collect_direct_python_dependencies(project.path)
    locked_dependencies = collect_uv_locked_python_dependencies(project.path)
    if not locked_dependencies:
        result.warnings.append("No runnable local Python environment or uv.lock found for Python dependency scan")
        return
    for package in sorted(direct_dependencies):
        current = locked_dependencies.get(package)
        if not current:
            continue
        try:
            latest = latest_version_fetcher(package)
        except Exception as exc:
            result.errors.append(f"Could not fetch latest PyPI version for {package}: {exc}")
            continue
        if latest and latest != current:
            result.updates.append(
                DependencyUpdate(
                    ecosystem="python",
                    package=package,
                    current=current,
                    wanted="",
                    latest=latest,
                    dependency_type="uv.lock",
                )
            )


def _fetch_latest_pypi_version(package: str) -> str:
    with urllib.request.urlopen(f"https://pypi.org/pypi/{package}/json", timeout=20) as response:
        metadata = json.loads(response.read().decode("utf-8"))
    version = metadata.get("info", {}).get("version", "")
    return str(version)


def _find_local_python(project_path: Path) -> Path | None:
    for relative in (Path(".venv/bin/python"), Path("venv/bin/python")):
        candidate = project_path / relative
        if candidate.exists():
            return candidate
    return None


def _is_uv_project(project_path: Path) -> bool:
    if (project_path / "uv.lock").exists():
        return True
    pyproject_path = project_path / "pyproject.toml"
    if not pyproject_path.exists():
        return False
    return "[tool.uv]" in pyproject_path.read_text(errors="ignore")
