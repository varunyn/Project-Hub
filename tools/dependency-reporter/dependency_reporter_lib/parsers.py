from __future__ import annotations

import json

from .models import DependencyUpdate
from .python_deps import _normalize_package_name


def parse_npm_outdated(raw: str, direct_dependencies: dict[str, str] | None = None) -> list[DependencyUpdate]:
    return parse_node_outdated(raw, direct_dependencies=direct_dependencies)


def parse_node_outdated(raw: str, direct_dependencies: dict[str, str] | None = None) -> list[DependencyUpdate]:
    if not raw.strip():
        return []
    parsed = json.loads(raw)
    updates: list[DependencyUpdate] = []
    if isinstance(parsed, dict):
        items = [(package, info) for package, info in parsed.items()]
    elif isinstance(parsed, list):
        items = [(str(info.get("name", "")), info) for info in parsed if isinstance(info, dict)]
    else:
        return []
    for package, info in sorted(items):
        if direct_dependencies is not None and package not in direct_dependencies:
            continue
        current = str(info.get("current", ""))
        if not current and direct_dependencies is not None:
            current = direct_dependencies.get(package, "")
        dependency_type = str(info.get("type", info.get("dependencyType", "")))
        updates.append(
            DependencyUpdate(
                ecosystem="node",
                package=package,
                current=current,
                wanted=str(info.get("wanted", "")),
                latest=str(info.get("latest", "")),
                dependency_type=dependency_type,
            )
        )
    return updates


def parse_pip_outdated(raw: str, direct_dependencies: set[str] | None = None) -> list[DependencyUpdate]:
    if not raw.strip():
        return []
    parsed = json.loads(raw)
    updates: list[DependencyUpdate] = []
    normalized_direct = {_normalize_package_name(name) for name in direct_dependencies or set()}
    for info in sorted(parsed, key=lambda item: item.get("name", "")):
        package_name = str(info.get("name", ""))
        if direct_dependencies is not None and _normalize_package_name(package_name) not in normalized_direct:
            continue
        updates.append(
            DependencyUpdate(
                ecosystem="python",
                package=package_name,
                current=str(info.get("version", "")),
                wanted="",
                latest=str(info.get("latest_version", "")),
                dependency_type=str(info.get("latest_filetype", "")),
            )
        )
    return updates
