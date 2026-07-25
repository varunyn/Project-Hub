## [Unreleased]

Last updated: 2026-07-25

### Added

- Added version-aware changelog retrieval using GitHub Releases, stable release-range aggregation, and raw `CHANGELOG.md` fallback.
- Added structured changelog source diagnostics, bounded concurrent lookups, process-local caching, and an opt-in live GitHub API smoke test.

### Changed

- Dependency reports now prefer version-specific release notes over scraping generic release pages and document the selected source and matched versions.

### Fixed

- Dependency report failures now display the reporter’s actual diagnostic output when the process writes errors to stdout.
