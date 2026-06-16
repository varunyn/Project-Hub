from __future__ import annotations

import re
from pathlib import Path

try:
    import tomllib
except ModuleNotFoundError:  # pragma: no cover - exercised on Python < 3.11
    tomllib = None


def collect_direct_python_dependencies(project_path: Path) -> set[str]:
    dependencies: set[str] = set()
    pyproject_path = project_path / "pyproject.toml"
    if pyproject_path.exists():
        dependencies.update(_collect_pyproject_dependencies(pyproject_path))
    requirements_path = project_path / "requirements.txt"
    if requirements_path.exists():
        dependencies.update(_collect_requirements_dependencies(requirements_path))
    pipfile_path = project_path / "Pipfile"
    if pipfile_path.exists():
        dependencies.update(_collect_pipfile_dependencies(pipfile_path))
    return dependencies


def collect_uv_locked_python_dependencies(project_path: Path) -> dict[str, str]:
    lock_path = project_path / "uv.lock"
    if not lock_path.exists():
        return {}
    parsed = _load_toml(lock_path)
    packages = parsed.get("package", [])
    if not isinstance(packages, list):
        return {}
    locked: dict[str, str] = {}
    for package in packages:
        if not isinstance(package, dict):
            continue
        name = package.get("name")
        version = package.get("version")
        if isinstance(name, str) and isinstance(version, str):
            locked[_normalize_package_name(name)] = version
    return locked


def _collect_pyproject_dependencies(pyproject_path: Path) -> set[str]:
    parsed = _load_toml(pyproject_path)
    dependencies: set[str] = set()
    project = parsed.get("project", {})
    project_dependencies = project.get("dependencies", [])
    if isinstance(project_dependencies, list):
        dependencies.update(_extract_requirement_names(project_dependencies))
    poetry_dependencies = parsed.get("tool", {}).get("poetry", {}).get("dependencies", {})
    if isinstance(poetry_dependencies, dict):
        dependencies.update(
            _normalize_package_name(package)
            for package in poetry_dependencies
            if _normalize_package_name(package) != "python"
        )
    return dependencies


def _collect_requirements_dependencies(requirements_path: Path) -> set[str]:
    return _extract_requirement_names(requirements_path.read_text().splitlines())


def _collect_pipfile_dependencies(pipfile_path: Path) -> set[str]:
    parsed = _load_toml(pipfile_path)
    packages = parsed.get("packages", {})
    if not isinstance(packages, dict):
        return set()
    return {_normalize_package_name(package) for package in packages}


def _extract_requirement_names(requirements: list[str]) -> set[str]:
    names: set[str] = set()
    for requirement in requirements:
        name = _extract_requirement_name(requirement)
        if name:
            names.add(_normalize_package_name(name))
    return names


def _extract_requirement_name(requirement: str) -> str | None:
    line = requirement.split("#", 1)[0].strip()
    if not line or line.startswith(("-", "git+", "http://", "https://", ".", "/")):
        return None
    match = re.match(r"([A-Za-z0-9][A-Za-z0-9._-]*)\s*(?:\[|[<>=!~; @]|$)", line)
    if not match:
        return None
    return match.group(1)


def _normalize_package_name(name: str) -> str:
    return re.sub(r"[-_.]+", "-", name).lower()


def _load_toml(path: Path) -> dict:
    text = path.read_text()
    if tomllib is not None:
        return tomllib.loads(text)
    return _parse_minimal_toml(text)


def _parse_minimal_toml(text: str) -> dict:
    parsed: dict = {}
    current: dict = parsed
    lines = iter(text.splitlines())
    for raw_line in lines:
        line = raw_line.split("#", 1)[0].strip()
        if not line:
            continue
        if line.startswith("[") and line.endswith("]"):
            current = parsed
            for part in line[1:-1].split("."):
                current = current.setdefault(part, {})
            continue
        if "=" not in line:
            continue
        key, value = [part.strip() for part in line.split("=", 1)]
        if value == "[":
            values: list[str] = []
            for list_line in lines:
                stripped = list_line.split("#", 1)[0].strip().rstrip(",")
                if stripped == "]":
                    break
                if stripped:
                    values.append(_parse_toml_scalar(stripped))
            current[key] = values
        elif value.startswith("[") and value.endswith("]"):
            current[key] = [
                _parse_toml_scalar(item.strip())
                for item in value[1:-1].split(",")
                if item.strip()
            ]
        else:
            current[key] = _parse_toml_scalar(value)
    return parsed


def _parse_toml_scalar(value: str) -> str:
    value = value.rstrip(",").strip()
    if (value.startswith('"') and value.endswith('"')) or (value.startswith("'") and value.endswith("'")):
        return value[1:-1]
    return value
