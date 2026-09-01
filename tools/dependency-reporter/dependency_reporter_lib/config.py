from __future__ import annotations

import json
import re
from pathlib import Path

from .models import AIConfig, Config, ReleaseIntelligenceConfig


def load_config(config_path: Path) -> Config:
    data: dict[str, dict[str, object] | list[str] | str] = {}
    current_key: str | None = None
    for raw_line in Path(config_path).read_text().splitlines():
        line = _strip_config_comment(raw_line)
        if not line:
            continue
        if not line.startswith(" ") and line.endswith(":"):
            current_key = line[:-1]
            data[current_key] = []
            continue
        if not line.startswith(" ") and ":" in line:
            key, value = line.split(":", 1)
            data[key.strip()] = _parse_config_scalar(value.strip())
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
            value = _parse_config_scalar(line.strip()[2:].strip())
            if not isinstance(value, str):
                raise ValueError(f"Config key {current_key} list items must be strings")
            values.append(value)
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
    release_cache_path = release_intelligence_raw.get("cache_path")
    return Config(
        scan_roots=[Path(path).expanduser() for path in scan_roots_raw],
        output_dir=Path(output_dir_raw).expanduser(),
        ignore_dirs=set(ignore_dirs_raw),
        release_intelligence=ReleaseIntelligenceConfig(
            enabled=bool(release_intelligence_raw.get("enabled", False)),
            max_packages=int(release_intelligence_raw.get("max_packages", 25)),
            evidence_max_chars=int(release_intelligence_raw.get("evidence_max_chars", 2000)),
            cache_path=Path(str(release_cache_path)).expanduser() if release_cache_path else None,
            cache_ttl_hours=int(release_intelligence_raw.get("cache_ttl_hours", 168)),
            cache_max_entries=int(release_intelligence_raw.get("cache_max_entries", 500)),
        ),
        ai=AIConfig(
            enabled=bool(ai_raw.get("enabled", False)),
            base_url=str(ai_raw.get("base_url", "https://api.openai.com/v1")),
            model=str(ai_raw.get("model", "gpt-4.1-mini")),
            api_key_env=str(ai_raw.get("api_key_env", "OPENAI_API_KEY")),
            completion_tokens=int(ai_raw.get("completion_tokens", 300)),
            reasoning_effort=(str(ai_raw["reasoning_effort"]) if ai_raw.get("reasoning_effort") else None),
            prompt_schema=str(ai_raw.get("prompt_schema", "dependency-summary-v1")),
        ),
    )


def _parse_config_scalar(value: str) -> object:
    if len(value) >= 2 and value.startswith('"') and value.endswith('"'):
        try:
            parsed = json.loads(value)
        except json.JSONDecodeError as exc:
            raise ValueError(f"Invalid quoted config value: {value}") from exc
        if not isinstance(parsed, str):
            raise ValueError(f"Quoted config value must be a string: {value}")
        return parsed
    if value.lower() == "true":
        return True
    if value.lower() == "false":
        return False
    if re.fullmatch(r"\d+", value):
        return int(value)
    return value


def _strip_config_comment(raw_line: str) -> str:
    in_quotes = False
    escaped = False
    for index, char in enumerate(raw_line):
        if char == '"' and not escaped:
            in_quotes = not in_quotes
        if char == "#" and not in_quotes:
            return raw_line[:index].rstrip()
        escaped = char == "\\" and not escaped
        if char != "\\":
            escaped = False
    return raw_line.rstrip()
