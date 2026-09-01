from __future__ import annotations

import html
import http.client
import json
import os
import re
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from dataclasses import asdict
from datetime import datetime, timedelta, timezone

from .models import AIConfig, Config, DependencyUpdate, ProjectResult, ReleaseInfo


MAX_RELEASE_NOTES_CHARS = 6000
GITHUB_RELEASE_PAGES = 3
DEFAULT_CACHE_TTL = timedelta(hours=24)
DEFAULT_MAX_WORKERS = 4
INCOMPLETE_READ_ATTEMPTS = 3
INCOMPLETE_READ_RETRY_DELAY_SECONDS = 0.5


class TTLCache:
    """Small thread-safe process-local cache used by release enrichment."""

    def __init__(self, ttl: timedelta = DEFAULT_CACHE_TTL):
        self.ttl = ttl
        self._items: dict[str, tuple[datetime, object]] = {}
        self._lock = threading.Lock()

    def get(self, key: str) -> object | None:
        now = datetime.now(timezone.utc)
        with self._lock:
            item = self._items.get(key)
            if item is None:
                return None
            expires_at, value = item
            if expires_at <= now:
                del self._items[key]
                return None
            return value

    def put(self, key: str, value: object) -> None:
        with self._lock:
            self._items[key] = (datetime.now(timezone.utc) + self.ttl, value)


class GitHubLookupError(Exception):
    def __init__(self, reason: str, status: str):
        super().__init__(reason)
        self.reason = reason
        self.status = status


def fetch_release_info(update: DependencyUpdate, fetch_json=None) -> ReleaseInfo:
    fetch_json = fetch_json or fetch_json_url
    if update.ecosystem == "python":
        package = urllib.parse.quote(update.package)
        return parse_pypi_release_metadata(update, fetch_json(f"https://pypi.org/pypi/{package}/json"))
    if update.ecosystem == "node":
        package = urllib.parse.quote(update.package, safe="")
        return parse_npm_release_metadata(update, fetch_json(f"https://registry.npmjs.org/{package}"))
    return ReleaseInfo()


def _read_url(request: urllib.request.Request, timeout: int) -> bytes:
    """Read an HTTP response, retrying only truncated transfers.

    Registry, GitHub, and local AI endpoints occasionally close a large response
    before its advertised content length has arrived. Retrying the whole request
    is safer than accepting a partial JSON or release-note payload.
    """
    for attempt in range(INCOMPLETE_READ_ATTEMPTS):
        try:
            with urllib.request.urlopen(request, timeout=timeout) as response:
                return response.read()
        except http.client.IncompleteRead:
            if attempt == INCOMPLETE_READ_ATTEMPTS - 1:
                raise
            time.sleep(INCOMPLETE_READ_RETRY_DELAY_SECONDS * (2**attempt))
    raise AssertionError("Incomplete-read retry loop exited unexpectedly")


def fetch_json_url(url: str) -> dict:
    request = urllib.request.Request(url, headers={"Accept": "application/json"})
    return json.loads(_read_url(request, timeout=30).decode("utf-8"))


def fetch_release_text(url: str, max_chars: int = MAX_RELEASE_NOTES_CHARS) -> str:
    request = urllib.request.Request(url, headers={"Accept": "text/html,text/plain,application/json"})
    raw = _read_url(request, timeout=30).decode("utf-8", errors="replace")
    return _sanitize_text(_strip_markup(raw), max_chars)


def fetch_raw_text(url: str, max_chars: int = MAX_RELEASE_NOTES_CHARS) -> str:
    request = urllib.request.Request(url, headers={"Accept": "text/plain"})
    raw = _read_url(request, timeout=30).decode("utf-8", errors="replace")
    return _sanitize_text(raw, max_chars)


def _strip_markup(raw: str) -> str:
    without_scripts = re.sub(r"<(script|style).*?</\1>", " ", raw, flags=re.IGNORECASE | re.DOTALL)
    without_tags = re.sub(r"<[^>]+>", " ", without_scripts)
    decoded = html.unescape(without_tags)
    return re.sub(r"\s+", " ", decoded).strip()


def _sanitize_text(raw: str, max_chars: int = MAX_RELEASE_NOTES_CHARS) -> str:
    raw = re.sub(r"<(script|style).*?</\1>", " ", raw, flags=re.IGNORECASE | re.DOTALL)
    raw = re.sub(r"<[^>]+>", " ", raw)
    raw = html.unescape(raw)
    raw = "".join(char for char in raw if char in "\n\t" or ord(char) >= 0x20)
    raw = raw.strip()
    return raw[:max_chars].rstrip()


def parse_pypi_release_metadata(update: DependencyUpdate, metadata: dict) -> ReleaseInfo:
    info = metadata.get("info", {})
    project_urls = info.get("project_urls", {}) if isinstance(info.get("project_urls", {}), dict) else {}
    repository_url = _pick_project_url(project_urls, ("source", "repository", "code"))
    return ReleaseInfo(
        current_release_date=_first_pypi_release_date(metadata, update.current),
        latest_release_date=_first_pypi_release_date(metadata, update.latest),
        homepage_url=str(info.get("home_page") or project_urls.get("Homepage") or ""),
        repository_url=repository_url,
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
    cache: TTLCache | None = None,
) -> None:
    if not config.release_intelligence.enabled:
        return
    ai_summarizer = ai_summarizer or summarize_update_with_ai
    cache = cache or TTLCache()
    updates = [
        update
        for result in results
        for update in result.updates[: config.release_intelligence.max_packages]
    ]
    # Keep the configured package cap global, matching the previous behavior.
    updates = updates[: config.release_intelligence.max_packages]

    def enrich(update: DependencyUpdate) -> None:
        try:
            metadata_key = (
                f"metadata:{update.ecosystem}:{update.package}:"
                f"{update.current}:{update.wanted}:{update.latest}"
            )
            release_info = cache.get(metadata_key)
            if not isinstance(release_info, ReleaseInfo):
                release_info = metadata_fetcher(update)
                cache.put(metadata_key, release_info)
            update.release_info = release_info
            _resolve_changelog(update, release_info, release_text_fetcher, cache)
        except (
            OSError,
            http.client.IncompleteRead,
            urllib.error.URLError,
            json.JSONDecodeError,
            KeyError,
            ValueError,
        ) as exc:
            update.release_info = ReleaseInfo(source="none", source_status="error", source_reason=str(exc))
        if config.ai.enabled and update.release_info is not None:
            try:
                _apply_ai_summary(update.release_info, ai_summarizer(update, update.release_info, config.ai))
            except (
                OSError,
                http.client.IncompleteRead,
                urllib.error.URLError,
                json.JSONDecodeError,
                KeyError,
                ValueError,
            ) as exc:
                update.release_info.ai_summary = f"AI summary unavailable: {exc}"

    with ThreadPoolExecutor(max_workers=DEFAULT_MAX_WORKERS) as executor:
        futures = [executor.submit(enrich, update) for update in updates]
        for future in futures:
            future.result()


def _resolve_changelog(
    update: DependencyUpdate,
    release_info: ReleaseInfo,
    release_text_fetcher,
    cache: TTLCache,
) -> None:
    github_repo = github_repository(release_info.repository_url)
    github_reason = ""
    if github_repo:
        try:
            releases = _github_releases(github_repo, cache)
            selected, complete = select_releases(releases, update.current, update.latest)
            if selected:
                target = selected[-1]
                release_info.source = "github_release"
                release_info.source_status = "success"
                release_info.release_url = str(target.get("html_url", ""))
                release_info.matched_versions = [str(item.get("tag_name", "")) for item in selected]
                release_info.is_range_complete = complete
                release_info.release_notes_excerpt = _sanitize_text(
                    _render_release_notes(selected), MAX_RELEASE_NOTES_CHARS
                )
                return
            github_reason = "No matching stable GitHub release found"
        except GitHubLookupError as exc:
            github_reason = exc.reason

        for tag in _tag_candidates(update.latest):
            raw_url = f"https://raw.githubusercontent.com/{github_repo}/{urllib.parse.quote(tag)}/CHANGELOG.md"
            try:
                text = _cached_text(raw_url, fetch_raw_text, cache)
            except (OSError, http.client.IncompleteRead, urllib.error.URLError, UnicodeError, ValueError):
                continue
            if text:
                release_info.source = "github_raw"
                release_info.source_status = "fallback"
                release_info.source_reason = github_reason
                release_info.changelog_url = raw_url
                release_info.release_url = f"https://github.com/{github_repo}/releases"
                release_info.matched_versions = [tag]
                release_info.is_range_complete = False
                release_info.release_notes_excerpt = text
                return

    if release_info.changelog_url:
        try:
            text = _cached_text(release_info.changelog_url, release_text_fetcher, cache)
        except (OSError, http.client.IncompleteRead, urllib.error.URLError, UnicodeError, ValueError) as exc:
            release_info.source_reason = str(exc)
        else:
            release_info.source = "package_metadata"
            release_info.source_status = "success" if text else "link_only"
            release_info.source_reason = github_reason
            release_info.release_notes_excerpt = text
            return

    if release_info.repository_url or release_info.homepage_url:
        release_info.source = "none"
        release_info.source_status = "link_only"
        release_info.source_reason = github_reason or "No release notes were available"
    else:
        release_info.source = "none"
        release_info.source_status = "unavailable"
        release_info.source_reason = github_reason or "No changelog source was discovered"


def _cached_text(url: str, fetcher, cache: TTLCache) -> str:
    key = f"text:{url}"
    cached = cache.get(key)
    if isinstance(cached, str):
        return cached
    text = fetcher(url)
    cache.put(key, text)
    return text


def _github_releases(repo: str, cache: TTLCache) -> list[dict]:
    key = f"github-releases:{repo}"
    cached = cache.get(key)
    if isinstance(cached, list):
        return cached
    releases: list[dict] = []
    for page in range(1, GITHUB_RELEASE_PAGES + 1):
        url = f"https://api.github.com/repos/{repo}/releases?per_page=100&page={page}"
        request = urllib.request.Request(url, headers={"Accept": "application/vnd.github+json"})
        try:
            payload = json.loads(_read_url(request, timeout=30).decode("utf-8"))
        except urllib.error.HTTPError as exc:
            if exc.code == 404:
                raise GitHubLookupError("GitHub repository or releases not found", "not_found") from exc
            if exc.code in (403, 429):
                raise GitHubLookupError("GitHub API rate limited or forbidden", "rate_limited") from exc
            raise GitHubLookupError(f"GitHub releases request failed with HTTP {exc.code}", "error") from exc
        except (OSError, http.client.IncompleteRead, json.JSONDecodeError) as exc:
            raise GitHubLookupError(f"GitHub releases request failed: {exc}", "error") from exc
        if not isinstance(payload, list):
            raise GitHubLookupError("GitHub releases response was not a list", "malformed")
        releases.extend(item for item in payload if isinstance(item, dict))
        if len(payload) < 100:
            break
    cache.put(key, releases)
    return releases


def github_repository(url: str) -> str:
    raw = (url or "").strip()
    if not raw:
        return ""
    if raw.startswith("git@github.com:"):
        path = raw.split(":", 1)[1]
    else:
        normalized = raw.replace("git+", "", 1)
        if normalized.startswith("git://"):
            normalized = "https://" + normalized[len("git://") :]
        if not normalized.startswith(("http://", "https://")):
            return ""
        parsed = urllib.parse.urlparse(normalized)
        if parsed.netloc.lower() != "github.com":
            return ""
        path = parsed.path.lstrip("/")
    parts = [part for part in path.split("/") if part]
    if len(parts) < 2:
        return ""
    if parts[2:3] and parts[2] in {"tree", "releases", "issues", "pulls", "commits"}:
        parts = parts[:2]
    owner, repo = parts[:2]
    repo = repo.removesuffix(".git")
    if not owner or not repo:
        return ""
    return f"{owner}/{repo}"


def _tag_candidates(version: str) -> list[str]:
    clean = re.sub(r"^(?:release-)?v", "", (version or "").strip(), flags=re.IGNORECASE)
    if not clean:
        return []
    return [clean, f"v{clean}", f"release-{clean}"]


def _parse_version(value: str) -> tuple[int, int, int] | None:
    match = re.search(r"(?<!\d)(\d+)(?:\.(\d+))?(?:\.(\d+))?", value or "")
    if not match:
        return None
    return tuple(int(group or 0) for group in match.groups())  # type: ignore[return-value]


def _version_precision(value: str) -> int:
    match = re.search(r"(?<!\d)(\d+)(?:\.(\d+))?(?:\.(\d+))?", value or "")
    if not match:
        return 0
    return 1 + sum(group is not None for group in match.groups()[1:])


def _is_prerelease(tag: str) -> bool:
    return bool(re.search(r"(?:-|_|\+)(?:alpha|beta|rc|pre|preview|dev)(?:\d|\b)", tag, re.IGNORECASE))


def select_releases(releases: list[dict], current: str, latest: str) -> tuple[list[dict], bool]:
    latest_core = _parse_version(latest)
    if latest_core is None:
        return [], False
    exact = {candidate.lower() for candidate in _tag_candidates(latest)}
    stable: list[tuple[tuple[int, int, int], dict]] = []
    latest_precision = _version_precision(latest)

    def within_latest(core: tuple[int, int, int]) -> bool:
        if latest_precision < 3:
            return core[:latest_precision] == latest_core[:latest_precision]
        return core <= latest_core

    for release in releases:
        tag = str(release.get("tag_name", ""))
        core = _parse_version(tag)
        if core is None or _is_prerelease(tag):
            continue
        if not within_latest(core):
            continue
        stable.append((core, release))
    current_core = _parse_version(current)
    if current_core is None:
        stable = [item for item in stable if str(item[1].get("tag_name", "")).lower() in exact]
        if not stable:
            stable = [item for item in stable if item[0] == latest_core]
    else:
        stable = [item for item in stable if current_core < item[0] and within_latest(item[0])]
    stable.sort(key=lambda item: item[0])
    if not stable:
        return [], False
    return [release for _, release in stable], current_core is not None


def _render_release_notes(releases: list[dict]) -> str:
    chunks: list[str] = []
    for release in releases:
        tag = str(release.get("tag_name", "")).strip()
        body = str(release.get("body", "")).strip()
        if body:
            chunks.append(f"## {tag}\n\n{body}")
    return "\n\n".join(chunks)


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
        if char == "\\\\" and in_string:
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
    request = urllib.request.Request(url, data=json.dumps(payload).encode("utf-8"), headers=headers, method="POST")
    data = json.loads(_read_url(request, timeout=60).decode("utf-8"))
    choices = data.get("choices", [])
    if not choices:
        return ""
    return str(choices[0].get("message", {}).get("content", "")).strip()


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
    cleaned = url.strip().removeprefix("git+")
    if cleaned.startswith("git://"):
        cleaned = "https://" + cleaned[len("git://") :]
    if cleaned.startswith("git@github.com:"):
        cleaned = "https://github.com/" + cleaned.split(":", 1)[1]
    if cleaned.endswith(".git"):
        cleaned = cleaned[:-4]
    return cleaned


def _infer_changelog_url(metadata: dict, repository_url: str) -> str:
    for key in ("changelog", "releaseNotes", "releases"):
        value = metadata.get(key)
        if isinstance(value, str):
            return value
    return ""
