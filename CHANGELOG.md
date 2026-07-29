## [Unreleased]

### Added

- Added a global `/tasks` workspace with all-project Kanban and list views, project and priority filters, search, drag-and-drop status changes, and task details.
- Added All tasks links to the dashboard header and sidebar navigation.
- Added MCP task tools and read-only resources for querying, creating, updating, moving, and deleting project tasks.

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
