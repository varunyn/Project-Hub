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


@dataclass
class AIConfig:
    enabled: bool = False
    base_url: str = "https://api.openai.com/v1"
    model: str = "gpt-4.1-mini"
    api_key_env: str = "OPENAI_API_KEY"


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
