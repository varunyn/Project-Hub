"""
FastMCP server for the Project Hub app.
Exposes tools so AI agents can query, add, and update projects.
Uses the same app/data/projects.json file as the Next.js app.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from fastmcp import FastMCP

# Resolve projects.json path relative to this file (app/data/projects.json)
_BASE = Path(__file__).resolve().parent.parent
PROJECTS_FILE = _BASE / "app" / "data" / "projects.json"

mcp = FastMCP(
    "Project Hub",
    instructions="Query, add, and update projects in the Project Hub app. Data is stored in app/data/projects.json.",
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


# --- Query tools (read-only) ---


@mcp.tool(annotations={"readOnlyHint": True})
def list_projects() -> list[dict[str, Any]]:
    """List all projects in the tracker. Returns full project objects with id, name, path, techStack, status, etc."""
    return _load_projects()


@mcp.tool(annotations={"readOnlyHint": True})
def get_project(project_id: str) -> dict[str, Any] | None:
    """Get a single project by its ID. Returns the project object or None if not found."""
    projects = _load_projects()
    for p in projects:
        if str(p.get("id")) == str(project_id):
            return p
    return None


@mcp.tool(annotations={"readOnlyHint": True})
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


# --- Write tools ---


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
