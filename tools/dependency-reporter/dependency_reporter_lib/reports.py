from __future__ import annotations

import json
from dataclasses import asdict
from datetime import datetime
from pathlib import Path

from .models import DependencyUpdate, ProjectResult, ReleaseInfo


def write_reports(
    results: list[ProjectResult],
    scan_roots: list[Path],
    output_dir: Path,
    date_string: str | None = None,
) -> dict[str, Path]:
    date_string = date_string or datetime.now().strftime("%Y-%m-%d")
    output_dir.mkdir(parents=True, exist_ok=True)
    markdown_path = output_dir / f"dependency-report-{date_string}.md"
    json_path = output_dir / f"dependency-report-{date_string}.json"
    markdown_path.write_text(_render_markdown(results, scan_roots, date_string))
    json_path.write_text(json.dumps(_render_json(results, scan_roots, date_string), indent=2))
    return {"markdown": markdown_path, "json": json_path}


def _render_markdown(results: list[ProjectResult], scan_roots: list[Path], date_string: str) -> str:
    projects_with_updates = sum(1 for result in results if result.updates)
    warning_count = sum(len(result.warnings) for result in results)
    error_count = sum(len(result.errors) for result in results)
    lines = [
        f"# Dependency Report - {date_string}",
        "",
        "## Summary",
        "",
        f"- Scan roots: {len(scan_roots)}",
        f"- Detected projects: {len(results)}",
        f"- Projects with updates: {projects_with_updates}",
        f"- Warnings: {warning_count}",
        f"- Errors: {error_count}",
        "",
    ]
    _append_upgrade_planning(lines, results)
    lines.extend(["## Projects With Updates", ""])
    results_with_updates = sorted(
        (result for result in results if result.updates),
        key=lambda item: str(item.project.path),
    )
    if results_with_updates:
        for result in results_with_updates:
            lines.extend(
                [
                    f"### {result.project.path}",
                    "",
                    f"- Ecosystems: {', '.join(result.project.ecosystems)}",
                    f"- Manifests: {', '.join(result.project.manifests)}",
                    "",
                ]
            )
            _append_updates_table(lines, result.updates)
    else:
        lines.extend(["No dependency updates found.", ""])
    lines.extend(["## Project Details", ""])
    for result in sorted(results, key=lambda item: str(item.project.path)):
        lines.extend(
            [
                f"### {result.project.path}",
                "",
                f"- Ecosystems: {', '.join(result.project.ecosystems)}",
                f"- Manifests: {', '.join(result.project.manifests)}",
                "",
            ]
        )
        if result.updates:
            _append_updates_table(lines, result.updates)
        else:
            lines.extend(["No dependency updates found or checked for this project.", ""])
        if result.warnings:
            lines.extend(["Warnings:", ""])
            lines.extend(f"- {warning}" for warning in result.warnings)
            lines.append("")
        if result.errors:
            lines.extend(["Errors:", ""])
            lines.extend(f"- {error}" for error in result.errors)
            lines.append("")
    return "\n".join(lines).rstrip() + "\n"


def _append_upgrade_planning(lines: list[str], results: list[ProjectResult]) -> None:
    updates_with_release_info = [
        (result.project.path, update)
        for result in results
        for update in result.updates
        if update.release_info is not None
    ]
    if not updates_with_release_info:
        return
    lines.extend(
        [
            "## Upgrade Planning",
            "",
            "| Project | Package | Ecosystem | Current | Latest | Latest Release | Source | Matched | Links |",
            "|---|---|---|---:|---:|---|---|---|---|",
        ]
    )
    for project_path, update in sorted(updates_with_release_info, key=lambda item: (str(item[0]), item[1].ecosystem, item[1].package)):
        release_info = update.release_info or ReleaseInfo()
        links = _format_release_links(release_info)
        source = release_info.source or "unknown"
        if release_info.source_status:
            source = f"{source} ({release_info.source_status})"
        matched = ", ".join(release_info.matched_versions) or "-"
        if release_info.source_reason:
            matched = f"{matched} ({release_info.source_reason})"
        lines.append(
            f"| {project_path} | {update.package} | {update.ecosystem} | {update.current} | {update.latest} | "
            f"{release_info.latest_release_date} | {source} | {matched} | {links} |"
        )
    structured_notes = [
        (project_path, update)
        for project_path, update in updates_with_release_info
        if update.release_info
        and (
            update.release_info.ai_priority
            or update.release_info.ai_risk
            or update.release_info.ai_suggested_action
            or update.release_info.ai_notable_changes
            or update.release_info.ai_breaking_changes
        )
    ]
    if structured_notes:
        lines.extend(
            [
                "",
                "### Upgrade Recommendations",
                "",
                "| Project | Package | Priority | Risk | Suggested Action |",
                "|---|---|---|---|---|",
            ]
        )
        for project_path, update in sorted(structured_notes, key=lambda item: (str(item[0]), item[1].ecosystem, item[1].package)):
            release_info = update.release_info or ReleaseInfo()
            lines.append(
                f"| {project_path} | {update.package} | {release_info.ai_priority} | "
                f"{release_info.ai_risk} | {release_info.ai_suggested_action} |"
            )
        lines.append("")
        for project_path, update in sorted(structured_notes, key=lambda item: (str(item[0]), item[1].ecosystem, item[1].package)):
            release_info = update.release_info or ReleaseInfo()
            if not release_info.ai_notable_changes and not release_info.ai_breaking_changes:
                continue
            lines.append(f"#### {project_path} / {update.package}")
            _append_change_list(lines, "Notable changes", release_info.ai_notable_changes)
            _append_change_list(lines, "Breaking changes", release_info.ai_breaking_changes)
    ai_notes = [
        (project_path, update)
        for project_path, update in updates_with_release_info
        if update.release_info and update.release_info.ai_summary
    ]
    if ai_notes:
        lines.extend(["", "### Upgrade Notes", ""])
        for project_path, update in sorted(ai_notes, key=lambda item: (str(item[0]), item[1].ecosystem, item[1].package)):
            lines.append(f"- **{project_path} / {update.package}**: {update.release_info.ai_summary}")
    lines.append("")


def _append_change_list(lines: list[str], label: str, changes: list[str]) -> None:
    if not changes:
        return
    lines.append("")
    lines.append(f"{label}:")
    for change in changes:
        lines.append(f"- {change}")
    lines.append("")


def _format_release_links(release_info: ReleaseInfo) -> str:
    links: list[str] = []
    if release_info.homepage_url:
        links.append(f"[Homepage]({release_info.homepage_url})")
    if release_info.repository_url:
        links.append(f"[Repository]({release_info.repository_url})")
    if release_info.changelog_url:
        links.append(f"[Changelog]({release_info.changelog_url})")
    if release_info.release_url and release_info.release_url != release_info.changelog_url:
        links.append(f"[Release]({release_info.release_url})")
    return ", ".join(links)


def _append_updates_table(lines: list[str], updates: list[DependencyUpdate]) -> None:
    lines.extend(
        [
            "| Package | Current | Wanted | Latest | Type |",
            "|---|---:|---:|---:|---|",
        ]
    )
    for update in updates:
        lines.append(
            f"| {update.package} | {update.current} | {update.wanted} | {update.latest} | {update.dependency_type} |"
        )
    lines.append("")


def _render_json(results: list[ProjectResult], scan_roots: list[Path], date_string: str) -> dict:
    return {
        "generated_at": date_string,
        "scan_roots": [str(path) for path in scan_roots],
        "projects": [
            {
                "path": str(result.project.path),
                "ecosystems": result.project.ecosystems,
                "manifests": result.project.manifests,
                "updates": [_render_update_json(update) for update in result.updates],
                "warnings": result.warnings,
                "errors": result.errors,
            }
            for result in sorted(results, key=lambda item: str(item.project.path))
        ],
    }


def _render_update_json(update: DependencyUpdate) -> dict:
    data = asdict(update)
    if update.release_info is None:
        data["release_info"] = None
    return data
