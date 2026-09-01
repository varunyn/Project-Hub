from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path


@dataclass
class Project:
    path: Path
    ecosystems: list[str]
    manifests: list[str] = field(default_factory=list)


@dataclass
class ReleaseInfo:
    current_release_date: str = ""
    latest_release_date: str = ""
    homepage_url: str = ""
    repository_url: str = ""
    changelog_url: str = ""
    release_notes_excerpt: str = ""
    ai_priority: str = ""
    ai_risk: str = ""
    ai_suggested_action: str = ""
    ai_notable_changes: list[str] = field(default_factory=list)
    ai_breaking_changes: list[str] = field(default_factory=list)
    ai_evidence_urls: list[str] = field(default_factory=list)
    ai_summary: str = ""
    source: str = ""
    source_status: str = ""
    source_reason: str = ""
    release_url: str = ""
    matched_versions: list[str] = field(default_factory=list)
    is_range_complete: bool | None = None
    ai_warning: str = ""


@dataclass
class DependencyUpdate:
    ecosystem: str
    package: str
    current: str
    wanted: str
    latest: str
    dependency_type: str
    release_info: ReleaseInfo | None = None


@dataclass
class ReleaseIntelligenceConfig:
    enabled: bool = False
    max_packages: int = 25
    evidence_max_chars: int = 2000
    cache_path: Path | None = None
    cache_ttl_hours: int = 168
    cache_max_entries: int = 500


@dataclass
class AIConfig:
    enabled: bool = False
    base_url: str = "https://api.openai.com/v1"
    model: str = "gpt-4.1-mini"
    api_key_env: str = "OPENAI_API_KEY"
    completion_tokens: int = 300
    reasoning_effort: str | None = None
    prompt_schema: str = "dependency-summary-v1"


@dataclass
class Config:
    scan_roots: list[Path]
    output_dir: Path
    ignore_dirs: set[str]
    release_intelligence: ReleaseIntelligenceConfig = field(default_factory=ReleaseIntelligenceConfig)
    ai: AIConfig = field(default_factory=AIConfig)


@dataclass
class CommandResult:
    returncode: int
    stdout: str
    stderr: str


@dataclass
class ProjectResult:
    project: Project
    updates: list[DependencyUpdate] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)
    enrichment_state: str = "disabled"
    enrichment_metrics: dict[str, object] = field(default_factory=dict)
