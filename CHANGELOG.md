## [Unreleased]

## [0.4.1] - 2026-09-01

### Fixed

- Project-scoped dependency reports now include dependency entries from nested package directories instead of appearing empty.

## [0.4.0] - 2026-09-01

### Added

- Unified the project and global task boards into a single TaskBoard module so both workspaces share the same board, list, filter, and editing behavior.
- The global `/tasks` workspace now supports the full task detail panel, including description, assignee, and due date.
- Replaced the Python/uv MCP server and optional Docker HTTP sidecar with a compiled TypeScript stdio server that shares the app’s domain utilities and JSON storage.

### Fixed

- Task moves now insert at the requested Kanban position and consistently normalize the source and destination columns.
- Prevented an SWR cache-key collision between project and all-task queries.

### Breaking

- MCP clients must run `pnpm build` and switch from the `uv` command to `node <path-to-project-hub>/mcp/dist/mcp/server.js`; project and task JSON data needs no migration.

## [0.3.0] - 2026-09-01

### Added

- Projects can now import GitHub issues, create issues from local tasks, and keep task status labels and issue state synchronized.
- Dependency reports can now include or skip AI suggestions per run, while remembering the selected mode for later reports.
- Dependency views now show report phases, cache and request counts, stage durations, and provider-reported token usage when available.

### Changed

- Dependency reports now ignore generated `.eve` snapshots, deduplicate equivalent AI analysis with a bounded persistent cache, and make deterministic results available before optional enrichment finishes.
- Dependency report runs are now persisted as server-managed background jobs with shared status and duplicate-run protection across navigation and refreshes.
- The global `/tasks` workspace now supports the full task detail panel, including description, assignee, and due date.
- Upgraded the app to Next.js 16.3.0 and switched the default font to a system stack so builds do not depend on Google Fonts being reachable.

### Fixed

- Project dependency views now read their latest scoped report, and the global dashboard merges newer project runs instead of showing stale package versions.
- The dependency detail AI suggestion action now reveals its reasoning, notable or breaking changes, and supporting evidence.
- Dependency reports now retry interrupted downloads and record individual enrichment failures instead of failing the complete report.
- AI enrichment failures now remain nonfatal warnings, and missing provider usage stays explicitly unavailable instead of being estimated.

- Production builds now complete with Turbopack while runtime filesystem scans remain excluded from standalone tracing.

### Breaking

- Removed the optional MCP service and its Docker configuration; remove the Project Hub server entry from MCP clients and any custom Compose references, because MCP API access has no direct replacement and project/task management now continues through the web app without a project-data migration.

## [0.2.0] - 2026-07-30

### Added

- Added optional GitHub issue sync for projects with a GitHub URL, including issue import and explicit local-task issue creation.
- Added a global `/tasks` workspace with all-project Kanban and list views, project and priority filters, search, drag-and-drop status changes, and task details.
- Added All tasks links to the dashboard header and sidebar navigation.
- Added MCP task tools and read-only resources for querying, creating, updating, moving, and deleting project tasks.

### Changed

- Completing a GitHub-linked task now closes its GitHub issue, and reopening the task reopens the issue.
- GitHub issue sync now shows accessible checking, success, no-change, and failure toast feedback.
- Moving a GitHub-linked task now replaces its repository `status:*` label while preserving other issue labels.
- Kanban drag-and-drop now updates optimistically and rolls back if the local or GitHub sync fails, keeping column changes responsive.
- Task update failures now appear as accessible toast notifications on both Kanban surfaces.

## [0.1.3] - 2026-07-29

### Added

- Added a dedicated project Tasks tab with Overview task summaries, Kanban and list views, filters, drag-and-drop status changes, task editing, and project-scoped API persistence.
- Added project-scoped task endpoints for creating, reading, updating, and deleting tasks with validated status, priority, and normalized column positions.
- Added version-aware changelog retrieval using GitHub Releases, stable release-range aggregation, and raw `CHANGELOG.md` fallback.
- Added structured changelog source diagnostics, bounded concurrent lookups, process-local caching, and an opt-in live GitHub API smoke test.

### Changed

- Dependency reports now prefer version-specific release notes over scraping generic release pages and document the selected source and matched versions.
- Task persistence now uses the project task API and server-side `tasks.json` storage instead of browser localStorage.

### Breaking

- Existing browser-only tasks are not migrated automatically; recreate them in the project Tasks workspace after upgrading.

### Fixed

- Dependency report failures now display the reporter’s actual diagnostic output when the process writes errors to stdout.
