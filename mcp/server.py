"""
FastMCP server for the Project Hub app.
Exposes tools so AI agents can query, add, and update projects and tasks.
Uses the same app/data/projects.json and app/data/tasks.json files as the Next.js app.
"""

from __future__ import annotations

import json
import os
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from uuid import uuid4

from fastmcp import FastMCP

# Resolve projects.json path relative to this file (app/data/projects.json)
_BASE = Path(__file__).resolve().parent.parent
_DATA_DIR = Path(os.environ.get("PROJECT_DATA_DIR") or _BASE / "app" / "data")
PROJECTS_FILE = _DATA_DIR / "projects.json"
TASKS_FILE = _DATA_DIR / "tasks.json"
DEPENDENCY_REPORTS_DIR = Path(
    os.environ.get("DEPENDENCY_REPORT_OUTPUT_DIR") or _DATA_DIR / "dependency-reports"
)
_REPORT_FILE_RE = re.compile(r"^dependency-report-\d{4}-\d{2}-\d{2}\.json$")
TASK_STATUSES = ("backlog", "todo", "in-progress", "review", "done")
TASK_PRIORITIES = ("low", "medium", "high")

mcp = FastMCP(
    "Project Hub",
    instructions="Query, add, and update projects and project tasks in Project Hub. Data is stored in app/data/projects.json and app/data/tasks.json.",
)


def _load_projects() -> list[dict[str, Any]]:
    if not PROJECTS_FILE.exists():
        return []
    with open(PROJECTS_FILE, encoding="utf-8") as f:
        return json.load(f)


def _save_projects(projects: list[dict[str, Any]]) -> None:
    PROJECTS_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(PROJECTS_FILE, "w", encoding="utf-8") as f:
        json.dump(projects, f, indent=2)


def _load_tasks() -> list[dict[str, Any]]:
    if not TASKS_FILE.exists():
        return []
    with open(TASKS_FILE, encoding="utf-8") as f:
        data = json.load(f)
    return data if isinstance(data, list) else []


def _save_tasks(tasks: list[dict[str, Any]]) -> None:
    TASKS_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(TASKS_FILE, "w", encoding="utf-8") as f:
        json.dump(tasks, f, indent=2)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _task_sort_key(task: dict[str, Any]) -> tuple[int, int, str]:
    status_index = TASK_STATUSES.index(task.get("status")) if task.get("status") in TASK_STATUSES else len(TASK_STATUSES)
    return (status_index, int(task.get("position") or 0), str(task.get("updatedAt") or ""))


def _normalize_project_tasks(tasks: list[dict[str, Any]], project_id: str) -> list[dict[str, Any]]:
    project_tasks = [task for task in tasks if str(task.get("projectId")) == str(project_id)]
    normalized: list[dict[str, Any]] = []
    for status in TASK_STATUSES:
        column = sorted(
            (task for task in project_tasks if task.get("status") == status),
            key=lambda task: int(task.get("position") or 0),
        )
        normalized.extend([{**task, "position": position} for position, task in enumerate(column)])
    return normalized


def _save_normalized_project_tasks(tasks: list[dict[str, Any]], project_id: str) -> None:
    _save_tasks(
        [task for task in tasks if str(task.get("projectId")) != str(project_id)]
        + _normalize_project_tasks(tasks, project_id)
    )


def _load_json_file(path: Path) -> dict[str, Any]:
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
    return data if isinstance(data, dict) else {}


def _latest_dependency_report_path() -> Path | None:
    if not DEPENDENCY_REPORTS_DIR.exists():
        return None
    report_names = sorted(
        path.name
        for path in DEPENDENCY_REPORTS_DIR.iterdir()
        if path.is_file() and _REPORT_FILE_RE.match(path.name)
    )
    if not report_names:
        return None
    return DEPENDENCY_REPORTS_DIR / report_names[-1]


def _dependency_totals(projects: list[dict[str, Any]]) -> dict[str, int]:
    return {
        "projects": len(projects),
        "updates": sum(len(p.get("updates") or []) for p in projects),
        "warnings": sum(len(p.get("warnings") or []) for p in projects),
        "errors": sum(len(p.get("errors") or []) for p in projects),
    }


def _missing_dependency_report() -> dict[str, Any]:
    return {
        "status": "missing",
        "generated_at": None,
        "scan_roots": [],
        "report_file_name": None,
        "projects": [],
        "totals": {"projects": 0, "updates": 0, "warnings": 0, "errors": 0},
    }


def _read_dependency_report() -> dict[str, Any]:
    report_path = _latest_dependency_report_path()
    if report_path is None:
        return _missing_dependency_report()

    raw_report = _load_json_file(report_path)
    projects = raw_report.get("projects")
    if not isinstance(projects, list):
        projects = []

    return {
        "status": "ready",
        "generated_at": raw_report.get("generated_at"),
        "scan_roots": raw_report.get("scan_roots") if isinstance(raw_report.get("scan_roots"), list) else [],
        "report_file_name": report_path.name,
        "projects": projects,
        "totals": _dependency_totals(projects),
    }


def _strip_trailing_slash(value: str) -> str:
    return value.rstrip("/")


def _normalize_report_path(value: str) -> str:
    host_root = os.environ.get("HOST_PROJECTS_ROOT")
    container_root = os.environ.get("CONTAINER_PROJECTS_ROOT")
    if not (host_root and container_root and value):
        return value

    normalized_value = _strip_trailing_slash(value)
    normalized_container_root = _strip_trailing_slash(container_root)
    if normalized_value == normalized_container_root or normalized_value.startswith(f"{normalized_container_root}/"):
        relative_path = normalized_value[len(normalized_container_root) :].lstrip("/")
        return str(Path(host_root) / relative_path)
    return value


def _resolve_project_path_for_server(project_path: str) -> str:
    host_root = os.environ.get("HOST_PROJECTS_ROOT")
    container_root = os.environ.get("CONTAINER_PROJECTS_ROOT")
    if host_root and container_root and project_path:
        try:
            relative_path = Path(project_path).resolve().relative_to(Path(host_root).resolve())
            return str(Path(container_root) / relative_path)
        except ValueError:
            pass
    return str(Path(project_path).resolve())


def _find_project(project_id_or_path: str) -> dict[str, Any] | None:
    target = str(project_id_or_path)
    for project in _load_projects():
        if str(project.get("id")) == target or str(project.get("path")) == target:
            return project
    return None


def _dependency_project_matches(
    dependency_project: dict[str, Any],
    project: dict[str, Any] | None,
    project_id_or_path: str,
) -> bool:
    report_path = str(dependency_project.get("path") or "")
    normalized_report_path = _normalize_report_path(report_path)
    if report_path == project_id_or_path or normalized_report_path == project_id_or_path:
        return True

    if not project:
        return False

    project_path = str(project.get("path") or "")
    return report_path == project_path or normalized_report_path == project_path or report_path == _resolve_project_path_for_server(project_path)


def _project_matches_query(project: dict[str, Any] | None, project_path: str, query: str) -> bool:
    q = query.lower()
    if q in project_path.lower():
        return True
    if not project:
        return False
    return q in str(project.get("id") or "").lower() or q in str(project.get("name") or "").lower()


# --- Query tools (read-only) ---


@mcp.tool(
    annotations={
        "title": "List Projects",
        "readOnlyHint": True,
        "openWorldHint": False,
    }
)
def list_projects() -> list[dict[str, Any]]:
    """List all projects in the tracker. Returns full project objects with id, name, path, techStack, status, etc."""
    return _load_projects()


@mcp.tool(
    annotations={
        "title": "Get Project",
        "readOnlyHint": True,
        "openWorldHint": False,
    }
)
def get_project(project_id: str) -> dict[str, Any] | None:
    """Get a single project by its ID. Returns the project object or None if not found."""
    projects = _load_projects()
    for p in projects:
        if str(p.get("id")) == str(project_id):
            return p
    return None


@mcp.tool(
    annotations={
        "title": "Search Projects",
        "readOnlyHint": True,
        "openWorldHint": False,
    }
)
def search_projects(
    query: str | None = None,
    status: str | None = None,
    tech: str | None = None,
) -> list[dict[str, Any]]:
    """Search projects by name/path (query), status ('in progress' | 'completed' | 'archived'), or tech stack (e.g. 'python', 'Next.js')."""
    projects = _load_projects()
    result = []
    q = (query or "").lower()
    st = (status or "").lower()
    te = (tech or "").lower()
    for p in projects:
        if q and q not in (p.get("name") or "").lower() and q not in (p.get("path") or "").lower():
            continue
        if st and (p.get("status") or "").lower() != st:
            continue
        if te and te not in [str(t).lower() for t in p.get("techStack") or []]:
            continue
        result.append(p)
    return result


@mcp.tool(
    annotations={"title": "List Tasks", "readOnlyHint": True, "openWorldHint": False}
)
def list_tasks(
    project_id: str | None = None,
    status: str | None = None,
    priority: str | None = None,
    query: str | None = None,
) -> list[dict[str, Any]]:
    """List tasks across all projects, with optional project, status, priority, and text filters."""
    tasks = sorted(_load_tasks(), key=_task_sort_key)
    query_text = (query or "").lower()
    return [
        task
        for task in tasks
        if (project_id is None or str(task.get("projectId")) == str(project_id))
        and (status is None or task.get("status") == status)
        and (priority is None or task.get("priority") == priority)
        and (
            not query_text
            or query_text in " ".join(
                [
                    str(task.get("title") or ""),
                    str(task.get("description") or ""),
                    " ".join(str(label) for label in task.get("labels") or []),
                ]
            ).lower()
        )
    ]


@mcp.tool(
    annotations={"title": "Get Task", "readOnlyHint": True, "openWorldHint": False}
)
def get_task(task_id: str) -> dict[str, Any] | None:
    """Get one task by ID, including its project ID, status, priority, and metadata."""
    return next((task for task in _load_tasks() if str(task.get("id")) == str(task_id)), None)


@mcp.tool(
    annotations={
        "title": "Get Dependency Report",
        "readOnlyHint": True,
        "openWorldHint": False,
    }
)
def get_dependency_report() -> dict[str, Any]:
    """Get the latest dependency tracker report, including projects, updates, release metadata, warnings, errors, and totals."""
    return _read_dependency_report()


@mcp.tool(
    annotations={
        "title": "Get Project Dependency Updates",
        "readOnlyHint": True,
        "openWorldHint": False,
    }
)
def get_project_dependency_updates(project_id_or_path: str) -> dict[str, Any]:
    """Get dependency tracker details for one tracked project by project ID or path."""
    project = _find_project(project_id_or_path)
    report = _read_dependency_report()
    if report["status"] != "ready":
        return {
            "status": report["status"],
            "project": project,
            "dependency_project": None,
            "updates": [],
            "report_file_name": report["report_file_name"],
        }

    for dependency_project in report["projects"]:
        if not isinstance(dependency_project, dict):
            continue
        if _dependency_project_matches(dependency_project, project, project_id_or_path):
            return {
                "status": "ready",
                "project": project,
                "dependency_project": dependency_project,
                "updates": dependency_project.get("updates") or [],
                "report_file_name": report["report_file_name"],
            }

    return {
        "status": "not_found",
        "project": project,
        "dependency_project": None,
        "updates": [],
        "report_file_name": report["report_file_name"],
    }


@mcp.tool(
    annotations={
        "title": "Search Dependency Updates",
        "readOnlyHint": True,
        "openWorldHint": False,
    }
)
def search_dependency_updates(
    package: str | None = None,
    ecosystem: str | None = None,
    project: str | None = None,
    risk: str | None = None,
) -> dict[str, Any]:
    """Search flattened dependency updates by package name, ecosystem, project ID/name/path, or AI risk."""
    report = _read_dependency_report()
    if report["status"] != "ready":
        return {"status": report["status"], "updates": [], "report_file_name": report["report_file_name"]}

    projects_by_path = {str(p.get("path") or ""): p for p in _load_projects()}
    package_query = (package or "").lower()
    ecosystem_query = (ecosystem or "").lower()
    project_query = (project or "").lower()
    risk_query = (risk or "").lower()
    updates: list[dict[str, Any]] = []

    for dependency_project in report["projects"]:
        if not isinstance(dependency_project, dict):
            continue
        report_path = str(dependency_project.get("path") or "")
        normalized_path = _normalize_report_path(report_path)
        tracked_project = projects_by_path.get(normalized_path) or projects_by_path.get(report_path)
        if project_query and not _project_matches_query(tracked_project, normalized_path or report_path, project_query):
            continue

        for update in dependency_project.get("updates") or []:
            if not isinstance(update, dict):
                continue
            release_info = update.get("release_info") if isinstance(update.get("release_info"), dict) else {}
            if package_query and package_query not in str(update.get("package") or "").lower():
                continue
            if ecosystem_query and ecosystem_query != str(update.get("ecosystem") or "").lower():
                continue
            if risk_query and risk_query != str(release_info.get("ai_risk") or "").lower():
                continue
            updates.append(
                {
                    "project_path": normalized_path or report_path,
                    "project": tracked_project,
                    **update,
                }
            )

    return {
        "status": "ready",
        "updates": updates,
        "report_file_name": report["report_file_name"],
        "totals": {"updates": len(updates)},
    }


# --- Resources and prompts ---


@mcp.resource("project-hub://projects")
def projects_resource() -> list[dict[str, Any]]:
    """Read-only snapshot of all tracked projects."""
    return _load_projects()


@mcp.resource("project-hub://tasks")
def tasks_resource() -> list[dict[str, Any]]:
    """Read-only snapshot of tasks across all projects."""
    return list_tasks()


@mcp.resource("project-hub://projects/{project_id}/tasks")
def project_tasks_resource(project_id: str) -> list[dict[str, Any]]:
    """Read-only snapshot of tasks belonging to one project."""
    return list_tasks(project_id=project_id)


@mcp.resource("project-hub://dependency-report/latest")
def dependency_report_resource() -> dict[str, Any]:
    """Read-only snapshot of the latest dependency tracker report."""
    return _read_dependency_report()


@mcp.resource("project-hub://projects/{project_id_or_path}/dependency-updates")
def project_dependency_updates_resource(project_id_or_path: str) -> dict[str, Any]:
    """Read-only dependency tracker details for one project."""
    return get_project_dependency_updates(project_id_or_path)


@mcp.prompt
def review_dependency_update_prompt(package_name: str, project_id_or_path: str | None = None) -> str:
    """Guide an agent through a dependency update review using Project Hub data."""
    project_scope = (
        f"Focus on project `{project_id_or_path}` and call get_project_dependency_updates first."
        if project_id_or_path
        else "Call search_dependency_updates to find matching project updates."
    )
    return (
        f"Review dependency update `{package_name}` in Project Hub. "
        f"{project_scope} Summarize current, wanted, and latest versions; dependency type; "
        "release dates; AI risk and priority; breaking changes; notable changes; evidence URLs; "
        "warnings or errors; and the safest next action. Do not recommend running package upgrades "
        "unless the dependency tracker report shows enough evidence to justify it."
    )


# --- Write tools ---


def _validate_task_fields(status: str, priority: str) -> None:
    if status not in TASK_STATUSES:
        raise ValueError(f"status must be one of: {', '.join(TASK_STATUSES)}")
    if priority not in TASK_PRIORITIES:
        raise ValueError(f"priority must be one of: {', '.join(TASK_PRIORITIES)}")


@mcp.tool()
def create_task(
    project_id: str,
    title: str,
    description: str = "",
    status: str = "todo",
    priority: str = "medium",
    assignee_id: str = "",
    labels: list[str] | None = None,
    due_date: str = "",
) -> dict[str, Any] | None:
    """Create a task in an existing project. Returns the task, or None when the project is not found."""
    if not any(str(project.get("id")) == str(project_id) for project in _load_projects()):
        return None
    if not title.strip():
        raise ValueError("title is required")
    _validate_task_fields(status, priority)
    now = _now()
    position = len([task for task in _load_tasks() if task.get("projectId") == project_id and task.get("status") == status])
    task = {
        "id": str(uuid4()),
        "projectId": project_id,
        "title": title.strip(),
        "description": description,
        "status": status,
        "priority": priority,
        "assigneeId": assignee_id,
        "labels": labels or [],
        "dueDate": due_date,
        "position": position,
        "createdAt": now,
        "updatedAt": now,
    }
    tasks = _load_tasks()
    tasks.append(task)
    _save_normalized_project_tasks(tasks, project_id)
    return next(item for item in _load_tasks() if item["id"] == task["id"])


@mcp.tool()
def update_task(
    task_id: str,
    project_id: str | None = None,
    title: str | None = None,
    description: str | None = None,
    status: str | None = None,
    priority: str | None = None,
    assignee_id: str | None = None,
    labels: list[str] | None = None,
    due_date: str | None = None,
    position: int | None = None,
) -> dict[str, Any] | None:
    """Update a task by ID. If project_id is supplied, it must match the task's project."""
    tasks = _load_tasks()
    existing = next((task for task in tasks if str(task.get("id")) == str(task_id)), None)
    if existing is None or (project_id is not None and str(existing.get("projectId")) != str(project_id)):
        return None
    next_status = status if status is not None else existing.get("status", "todo")
    next_priority = priority if priority is not None else existing.get("priority", "medium")
    _validate_task_fields(next_status, next_priority)
    updated = dict(existing)
    for key, value in {
        "title": title.strip() if title is not None else None,
        "description": description,
        "status": status,
        "priority": priority,
        "assigneeId": assignee_id,
        "labels": labels,
        "dueDate": due_date,
        "position": position,
    }.items():
        if value is not None:
            updated[key] = value
    if title is not None and not title.strip():
        raise ValueError("title cannot be empty")
    updated["updatedAt"] = _now()
    tasks = [updated if str(task.get("id")) == str(task_id) else task for task in tasks]
    if status is not None or position is not None:
        project_tasks = [task for task in tasks if task.get("projectId") == existing.get("projectId") and task.get("id") != task_id]
        column = sorted(
            [task for task in project_tasks if task.get("status") == updated["status"]],
            key=lambda task: int(task.get("position") or 0),
        )
        insert_at = max(0, min(int(position if position is not None else len(column)), len(column)))
        column.insert(insert_at, updated)
        for index, task in enumerate(column):
            task["position"] = index
    _save_normalized_project_tasks(tasks, str(existing["projectId"]))
    return next(item for item in _load_tasks() if item["id"] == task_id)


@mcp.tool(annotations={"destructiveHint": True})
def delete_task(task_id: str) -> bool:
    """Delete a task by ID and normalize the remaining project column positions."""
    tasks = _load_tasks()
    existing = next((task for task in tasks if str(task.get("id")) == str(task_id)), None)
    if existing is None:
        return False
    remaining = [task for task in tasks if str(task.get("id")) != str(task_id)]
    _save_normalized_project_tasks(remaining, str(existing["projectId"]))
    return True


@mcp.tool()
def add_project(
    name: str,
    path: str,
    tech_stack: list[str] | None = None,
    status: str = "in progress",
    readme_preview: str = "",
    url: str = "",
    github_url: str = "",
) -> dict[str, Any]:
    """Add a new project. Required: name, path. Optional: tech_stack, status, readme_preview, url, github_url. Returns the created project with id and dates set."""
    from datetime import date

    projects = _load_projects()
    today = date.today().isoformat()
    new_id = str(int(__import__("time").time() * 1000))
    project = {
        "id": new_id,
        "name": name,
        "path": path,
        "techStack": tech_stack or [],
        "dateCreated": today,
        "lastUpdated": today,
        "readmePreview": readme_preview or "",
        "url": url or "",
        "githubUrl": github_url or "",
        "status": status,
    }
    projects.append(project)
    _save_projects(projects)
    return project


@mcp.tool()
def update_project(
    project_id: str,
    name: str | None = None,
    path: str | None = None,
    tech_stack: list[str] | None = None,
    status: str | None = None,
    readme_preview: str | None = None,
    url: str | None = None,
    github_url: str | None = None,
) -> dict[str, Any] | None:
    """Update an existing project by ID. Only provided fields are updated. Returns the updated project or None if not found."""
    from datetime import date

    projects = _load_projects()
    for i, p in enumerate(projects):
        if str(p.get("id")) != str(project_id):
            continue
        updated = dict(p)
        if name is not None:
            updated["name"] = name
        if path is not None:
            updated["path"] = path
        if tech_stack is not None:
            updated["techStack"] = tech_stack
        if status is not None:
            updated["status"] = status
        if readme_preview is not None:
            updated["readmePreview"] = readme_preview
        if url is not None:
            updated["url"] = url
        if github_url is not None:
            updated["githubUrl"] = github_url
        updated["lastUpdated"] = date.today().isoformat()
        projects[i] = updated
        _save_projects(projects)
        return updated
    return None


@mcp.tool(annotations={"destructiveHint": True})
def delete_project(project_id: str) -> bool:
    """Delete a project by ID. Returns True if deleted, False if not found."""
    projects = _load_projects()
    new_list = [p for p in projects if str(p.get("id")) != str(project_id)]
    if len(new_list) == len(projects):
        return False
    _save_projects(new_list)
    return True


if __name__ == "__main__":
    mcp.run()
