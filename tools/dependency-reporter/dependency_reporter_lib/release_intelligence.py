from __future__ import annotations

import html
import json
import os
import re
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import asdict

from .models import AIConfig, Config, DependencyUpdate, ProjectResult, ReleaseInfo


def fetch_release_info(update: DependencyUpdate, fetch_json=None) -> ReleaseInfo:
    fetch_json = fetch_json or fetch_json_url
    if update.ecosystem == "python":
        package = urllib.parse.quote(update.package)
        return parse_pypi_release_metadata(update, fetch_json(f"https://pypi.org/pypi/{package}/json"))
    if update.ecosystem == "node":
        package = urllib.parse.quote(update.package, safe="")
        return parse_npm_release_metadata(update, fetch_json(f"https://registry.npmjs.org/{package}"))
    return ReleaseInfo()


def fetch_json_url(url: str) -> dict:
    request = urllib.request.Request(url, headers={"Accept": "application/json"})
    with urllib.request.urlopen(request, timeout=30) as response:
        return json.loads(response.read().decode("utf-8"))


def fetch_release_text(url: str, max_chars: int = 6000) -> str:
    request = urllib.request.Request(url, headers={"Accept": "text/html,text/plain,application/json"})
    with urllib.request.urlopen(request, timeout=30) as response:
        raw = response.read().decode("utf-8", errors="replace")
    text = _strip_markup(raw)
    return text[:max_chars].strip()


def _strip_markup(raw: str) -> str:
    without_scripts = re.sub(r"<(script|style).*?</\1>", " ", raw, flags=re.IGNORECASE | re.DOTALL)
    without_tags = re.sub(r"<[^>]+>", " ", without_scripts)
    decoded = html.unescape(without_tags)
    return re.sub(r"\s+", " ", decoded).strip()


def parse_pypi_release_metadata(update: DependencyUpdate, metadata: dict) -> ReleaseInfo:
    info = metadata.get("info", {})
    project_urls = info.get("project_urls", {}) if isinstance(info.get("project_urls", {}), dict) else {}
    return ReleaseInfo(
        current_release_date=_first_pypi_release_date(metadata, update.current),
        latest_release_date=_first_pypi_release_date(metadata, update.latest),
        homepage_url=str(info.get("home_page") or project_urls.get("Homepage") or ""),
        repository_url=_pick_project_url(project_urls, ("source", "repository", "code")),
        changelog_url=_pick_project_url(project_urls, ("changelog", "release", "history", "news")),
    )


def parse_npm_release_metadata(update: DependencyUpdate, metadata: dict) -> ReleaseInfo:
    repository = metadata.get("repository", "")
    if isinstance(repository, dict):
        repository_url = str(repository.get("url", ""))
    else:
        repository_url = str(repository or "")
    repository_url = _clean_repository_url(repository_url)
    time_info = metadata.get("time", {}) if isinstance(metadata.get("time", {}), dict) else {}
    return ReleaseInfo(
        current_release_date=str(time_info.get(update.current, "")),
        latest_release_date=str(time_info.get(update.latest, "")),
        homepage_url=str(metadata.get("homepage", "")),
        repository_url=repository_url,
        changelog_url=_infer_changelog_url(metadata, repository_url),
    )


def enrich_results_with_release_intelligence(
    results: list[ProjectResult],
    config: Config,
    metadata_fetcher=fetch_release_info,
    release_text_fetcher=fetch_release_text,
    ai_summarizer=None,
) -> None:
    if not config.release_intelligence.enabled:
        return
    ai_summarizer = ai_summarizer or summarize_update_with_ai
    enriched_count = 0
    for result in results:
        for update in result.updates:
            if enriched_count >= config.release_intelligence.max_packages:
                return
            try:
                update.release_info = metadata_fetcher(update)
            except (OSError, urllib.error.URLError, json.JSONDecodeError, KeyError, ValueError) as exc:
                update.release_info = ReleaseInfo(ai_summary=f"Release metadata unavailable: {exc}")
            if update.release_info.changelog_url:
                try:
                    update.release_info.release_notes_excerpt = release_text_fetcher(update.release_info.changelog_url)
                except (OSError, urllib.error.URLError, UnicodeError, ValueError) as exc:
                    update.release_info.release_notes_excerpt = f"Release notes unavailable: {exc}"
            if config.ai.enabled:
                try:
                    _apply_ai_summary(update.release_info, ai_summarizer(update, update.release_info, config.ai))
                except (OSError, urllib.error.URLError, json.JSONDecodeError, KeyError, ValueError) as exc:
                    update.release_info.ai_summary = f"AI summary unavailable: {exc}"
            enriched_count += 1


def _apply_ai_summary(release_info: ReleaseInfo, raw_summary: str) -> None:
    json_text = _extract_json_object(raw_summary)
    if not json_text:
        release_info.ai_summary = raw_summary
        return
    try:
        parsed = json.loads(json_text)
    except json.JSONDecodeError:
        release_info.ai_summary = raw_summary
        return
    if not isinstance(parsed, dict):
        release_info.ai_summary = raw_summary
        return
    release_info.ai_suggested_action = str(parsed.get("suggested_action", ""))
    release_info.ai_notable_changes = _string_list(parsed.get("notable_changes", []))
    release_info.ai_breaking_changes = _string_list(parsed.get("breaking_changes", []))
    release_info.ai_evidence_urls = _string_list(parsed.get("evidence_urls", []))
    release_info.ai_summary = str(parsed.get("summary", ""))
    release_info.ai_priority = str(parsed.get("priority", "")) or _infer_ai_priority(release_info)
    release_info.ai_risk = str(parsed.get("risk", "")) or _infer_ai_risk(release_info)


def _infer_ai_priority(release_info: ReleaseInfo) -> str:
    if release_info.ai_breaking_changes:
        return "high"
    if release_info.ai_notable_changes or release_info.ai_summary or release_info.ai_suggested_action:
        return "medium"
    return ""


def _infer_ai_risk(release_info: ReleaseInfo) -> str:
    if release_info.ai_breaking_changes:
        return "high"
    if release_info.ai_notable_changes or release_info.ai_summary or release_info.ai_suggested_action:
        return "low"
    return ""


def _extract_json_object(text: str) -> str:
    stripped = text.strip()
    if stripped.startswith("{") and stripped.endswith("}"):
        return stripped
    fenced = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, flags=re.IGNORECASE | re.DOTALL)
    if fenced:
        return fenced.group(1).strip()
    start = text.find("{")
    if start == -1:
        return ""
    depth = 0
    in_string = False
    escaped = False
    for index in range(start, len(text)):
        char = text[index]
        if escaped:
            escaped = False
            continue
        if char == "\\" and in_string:
            escaped = True
            continue
        if char == '"':
            in_string = not in_string
            continue
        if in_string:
            continue
        if char == "{":
            depth += 1
        elif char == "}":
            depth -= 1
            if depth == 0:
                return text[start : index + 1].strip()
    return ""


def _string_list(value: object) -> list[str]:
    if not isinstance(value, list):
        return []
    return [str(item) for item in value]


def summarize_update_with_ai(update: DependencyUpdate, release_info: ReleaseInfo, ai_config: AIConfig) -> str:
    api_key = os.environ.get(ai_config.api_key_env) if ai_config.api_key_env else ""
    local_endpoint = "localhost" in ai_config.base_url or "127.0.0.1" in ai_config.base_url
    if not api_key and ai_config.api_key_env and not local_endpoint:
        raise ValueError(f"missing API key in {ai_config.api_key_env}")
    payload = {
        "model": ai_config.model,
        "messages": [
            {
                "role": "system",
                "content": (
                    "Summarize dependency upgrade value from provided release evidence only. "
                    "Do not invent release notes. Return strict JSON with keys: priority, risk, "
                    "suggested_action, notable_changes, breaking_changes, evidence_urls, summary."
                ),
            },
            {
                "role": "user",
                "content": json.dumps(
                    {
                        "ecosystem": update.ecosystem,
                        "package": update.package,
                        "current": update.current,
                        "wanted": update.wanted,
                        "latest": update.latest,
                        "release_info": asdict(release_info),
                    }
                ),
            },
        ],
        "temperature": 0.2,
    }
    url = ai_config.base_url.rstrip("/") + "/chat/completions"
    headers = {"Content-Type": "application/json"}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"
    elif local_endpoint:
        headers["Authorization"] = "Bearer ollama"
    request = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers=headers,
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=60) as response:
        data = json.loads(response.read().decode("utf-8"))
    choices = data.get("choices", [])
    if not choices:
        return ""
    message = choices[0].get("message", {})
    return str(message.get("content", "")).strip()


def _first_pypi_release_date(metadata: dict, version: str) -> str:
    releases = metadata.get("releases", {})
    files = releases.get(version, []) if isinstance(releases, dict) else []
    if not files:
        return ""
    return str(files[0].get("upload_time_iso_8601", ""))


def _pick_project_url(project_urls: dict, keywords: tuple[str, ...]) -> str:
    for label, url in project_urls.items():
        normalized_label = str(label).lower()
        if any(keyword in normalized_label for keyword in keywords):
            return str(url)
    return ""


def _clean_repository_url(url: str) -> str:
    cleaned = url.removeprefix("git+")
    if cleaned.endswith(".git"):
        cleaned = cleaned[:-4]
    return cleaned


def _infer_changelog_url(metadata: dict, repository_url: str) -> str:
    for key in ("changelog", "releaseNotes", "releases"):
        value = metadata.get(key)
        if isinstance(value, str):
            return value
    if "github.com" in repository_url:
        return repository_url.rstrip("/") + "/releases"
    return ""
