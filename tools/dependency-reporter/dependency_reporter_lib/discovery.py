from __future__ import annotations

import os
from pathlib import Path
from collections.abc import Iterator

from .models import Project


PYTHON_MANIFESTS = {"requirements.txt", "pyproject.toml", "Pipfile"}
# Eve stores generated runtime snapshots below this directory. It is deliberately
# explicit rather than treating every dot-directory as generated, since hidden
# source directories can contain legitimate projects.
GENERATED_IGNORE_DIRS = {".eve"}


def discover_projects(scan_roots: list[Path], ignore_dirs: set[str]) -> list[Project]:
    projects: list[Project] = []
    for root in scan_roots:
        root = Path(root).expanduser()
        if not root.exists():
            continue
        for current, dirs, files in _walk(root, ignore_dirs):
            file_set = set(files)
            ecosystems: list[str] = []
            manifests: list[str] = []
            if "package.json" in file_set:
                ecosystems.append("node")
                manifests.append("package.json")
            python_manifests = sorted(file_set & PYTHON_MANIFESTS)
            if python_manifests:
                ecosystems.append("python")
                manifests.extend(python_manifests)
            if ecosystems:
                projects.append(Project(path=current, ecosystems=ecosystems, manifests=manifests))
    return sorted(projects, key=lambda project: str(project.path))


def _walk(root: Path, ignore_dirs: set[str]) -> Iterator[tuple[Path, list[str], list[str]]]:
    ignored = set(ignore_dirs) | GENERATED_IGNORE_DIRS
    for current, dirs, files in os.walk(root):
        dirs[:] = [directory for directory in dirs if directory not in ignored]
        yield Path(current), dirs, files
