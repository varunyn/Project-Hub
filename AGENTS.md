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

# Release instructions

When preparing a release, publish a GitHub Release with concise, user-facing release notes. Do not rely on `--generate-notes` alone: direct commits and unlabeled pull requests can produce an empty release body.

## Release notes

- Base the notes on the corresponding versioned `CHANGELOG.md` section.
- Start with a `## Highlights` heading and summarize the most important user-facing changes.
- Include `## Upgrade notes` when configuration, migration, or breaking-change information matters.
- State `No breaking changes or migration required.` when that is true.
- Include the full changelog comparison link as a supplement, not as the only release content.

## Publishing checklist

1. Confirm the version in `package.json`, the release tag, and the versioned changelog heading agree.
2. Run the relevant tests and checks.
3. Create the release with an explicit title and notes body or notes file.
4. Read the published release page/API response to verify its notes are present and accurate.
