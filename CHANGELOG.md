## [Unreleased]

### Changed

- Upgraded the app to Next.js 16.3.0 and switched the default font to a system stack so builds do not depend on Google Fonts being reachable.

### Fixed

- Production builds now complete with Turbopack while runtime filesystem scans remain excluded from standalone tracing.

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
