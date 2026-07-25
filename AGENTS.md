# Changelog instructions

Update `CHANGELOG.md` when a code change has user-visible impact.

## Include

- New features and meaningful behavior changes.
- Bug fixes, performance improvements, security fixes, and deprecations.
- Breaking changes, clearly labeled under `### Breaking`.
- Documentation changes only when they materially affect users.

Ignore formatting-only changes, internal refactors without behavior changes, test-only changes, and dependency updates without user impact.

## Writing rules

- Use plain, concise, user-facing language.
- Explain what changed and why it matters.
- Keep each bullet to one sentence when possible.
- Describe user impact rather than implementation details.
- Review the current diff before writing entries.
- Avoid vague phrases such as “miscellaneous fixes.”

## Format

Add new entries at the top under `## [Unreleased]`:

```markdown
## [Unreleased]

### Added

- ...

### Changed

- ...

### Fixed

- ...

### Breaking

- ...
```

Use only the sections that contain entries. Merge duplicate entries from related changes. Do not move Unreleased items into a versioned section unless a release is being prepared.

For released versions, include the release date in the heading using `## [1.4.0] - YYYY-MM-DD`. Keep `## [Unreleased]` undated, and add a `Last updated: YYYY-MM-DD` line when the current unreleased entries need an explicit review date.

Before finishing, verify that the entry is accurate, user-visible, correctly categorized, and clear about migration needs.

In the final response, summarize the changelog entry and state whether the change is breaking or requires migration.
