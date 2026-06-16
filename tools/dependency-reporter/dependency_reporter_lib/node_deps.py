from __future__ import annotations

import json
from pathlib import Path


def collect_direct_node_dependencies(project_path: Path) -> dict[str, str]:
    package_json_path = project_path / "package.json"
    if not package_json_path.exists():
        return {}
    parsed = json.loads(package_json_path.read_text())
    direct_dependencies: dict[str, str] = {}
    for section in ("dependencies", "devDependencies", "peerDependencies", "optionalDependencies"):
        values = parsed.get(section, {})
        if isinstance(values, dict):
            direct_dependencies.update({str(package): str(version) for package, version in values.items()})
    return direct_dependencies
