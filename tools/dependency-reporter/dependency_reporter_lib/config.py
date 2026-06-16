from __future__ import annotations

import re
from pathlib import Path

from .models import AIConfig, Config, ReleaseIntelligenceConfig


def load_config(config_path: Path) -> Config:
    data: dict[str, dict[str, object] | list[str] | str] = {}
    current_key: str | None = None
    for raw_line in Path(config_path).read_text().splitlines():
        line = raw_line.split("#", 1)[0].rstrip()
        if not line:
            continue
        if not line.startswith(" ") and line.endswith(":"):
            current_key = line[:-1]
            data[current_key] = []
            continue
        if not line.startswith(" ") and ":" in line:
            key, value = line.split(":", 1)
            data[key.strip()] = value.strip()
            current_key = None
            continue
        if current_key and line.startswith(" ") and ":" in line and not line.strip().startswith("- "):
            values = data.get(current_key)
            if not isinstance(values, dict):
                values = {}
                data[current_key] = values
            key, value = line.strip().split(":", 1)
            values[key.strip()] = _parse_config_scalar(value.strip())
            continue
        if current_key and line.strip().startswith("- "):
            values = data.setdefault(current_key, [])
            if not isinstance(values, list):
                raise ValueError(f"Config key {current_key} cannot contain list items")
            values.append(line.strip()[2:].strip())
    scan_roots_raw = data.get("scan_roots", [])
    if not isinstance(scan_roots_raw, list) or not scan_roots_raw:
        raise ValueError("config must define at least one scan_roots entry")
    output_dir_raw = data.get("output_dir", "outputs")
    ignore_dirs_raw = data.get("ignore_dirs", [])
    if not isinstance(output_dir_raw, str):
        raise ValueError("output_dir must be a string")
    if not isinstance(ignore_dirs_raw, list):
        raise ValueError("ignore_dirs must be a list")
    release_intelligence_raw = data.get("release_intelligence", {})
    ai_raw = data.get("ai", {})
    if not isinstance(release_intelligence_raw, dict):
        release_intelligence_raw = {}
    if not isinstance(ai_raw, dict):
        ai_raw = {}
    return Config(
        scan_roots=[Path(path).expanduser() for path in scan_roots_raw],
        output_dir=Path(output_dir_raw).expanduser(),
        ignore_dirs=set(ignore_dirs_raw),
        release_intelligence=ReleaseIntelligenceConfig(
            enabled=bool(release_intelligence_raw.get("enabled", False)),
            max_packages=int(release_intelligence_raw.get("max_packages", 25)),
        ),
        ai=AIConfig(
            enabled=bool(ai_raw.get("enabled", False)),
            base_url=str(ai_raw.get("base_url", "https://api.openai.com/v1")),
            model=str(ai_raw.get("model", "gpt-4.1-mini")),
            api_key_env=str(ai_raw.get("api_key_env", "OPENAI_API_KEY")),
        ),
    )


def _parse_config_scalar(value: str) -> object:
    if value.lower() == "true":
        return True
    if value.lower() == "false":
        return False
    if re.fullmatch(r"\d+", value):
        return int(value)
    return value
