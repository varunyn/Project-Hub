# Local Dependency Reporter

Report-only dependency update scanner for local Python and React/Node projects.

## What It Does

- Scans configured parent folders recursively.
- Detects Node projects with `package.json`.
- Detects Python projects with `requirements.txt`, `pyproject.toml`, or `Pipfile`.
- Runs read-only checks for available newer versions.
- Optionally fetches release metadata from PyPI and npm.
- Optionally resolves version-aware changelog and release-note text for update planning.
- Optionally adds structured AI upgrade recommendations with an OpenAI-compatible chat API.
- Writes dated Markdown and JSON reports.

It does not edit dependency files, install packages, upgrade apps, or require git.

## Usage

```bash
python3 dependency_reporter.py --config config.yaml
```

Default reports are written to:

- `outputs/dependency-report-YYYY-MM-DD.md`
- `outputs/dependency-report-YYYY-MM-DD.json`

## Python Projects

Python checks use a local `.venv/bin/python` or `venv/bin/python` inside each project. If neither exists, the report records a warning and continues.

Python reports only include direct runtime dependencies declared in:

- `[project].dependencies` in `pyproject.toml`
- `[tool.poetry.dependencies]` in `pyproject.toml`
- `requirements.txt`
- `[packages]` in `Pipfile`

Transitive packages installed into the environment are filtered out.

Projects with `uv.lock` or a `[tool.uv]` section in `pyproject.toml` are checked with:

```bash
uv pip list --outdated --format=json --python .venv/bin/python
```

Other Python projects are checked with:

```bash
.venv/bin/python -m pip list --outdated --format=json
```

## Node Projects

Node checks use:

```bash
npm outdated --json
```

pnpm projects use:

```bash
pnpm outdated --format json
```

Node reports are filtered to direct dependencies declared in `package.json`. If the package manager does not report an installed current version, the report falls back to the declared package range from `package.json`.

Yarn projects without `package-lock.json` are reported as unsupported in v1.

## Project-Specific Configs

The repository includes a config for the React project tracker app:

```bash
python3 dependency_reporter.py --config config.project-tracker.yaml
```

## Release Intelligence

Release intelligence is optional for standalone reporter runs and disabled by default. When enabled, the reporter fetches release metadata for outdated direct dependencies from PyPI and npm, then resolves release notes using this order:

1. GitHub Releases API, when package metadata identifies a GitHub repository.
2. A raw `CHANGELOG.md` at likely target-version tags.
3. An explicit changelog or history URL from npm/PyPI metadata.
4. The repository or homepage as a link-only fallback.

GitHub release matching supports plain, `v`-prefixed, and `release-`-prefixed tags. Stable releases across the `(current, latest]` range are aggregated and ordered by version. Prereleases are excluded from range summaries. GitHub API failures, including rate limits, are recorded as source diagnostics and do not prevent fallback resolution.

Release lookups use a bounded, thread-safe cache with a 168-hour TTL and up to 500 entries by default, persisted atomically when `cache_path` is configured. Up to four package enrichments run concurrently. GitHub requests are anonymous in v1; a live GitHub token is not required.

The same local cache stores successful AI summaries. An entry is reused only when the ecosystem, package, version transition, release-evidence fingerprint, configured model, and prompt schema match; changing any of those inputs causes a miss. Transport errors, malformed responses, missing evidence, and partial results are not cached as successful suggestions.

```yaml
release_intelligence:
  enabled: true
  max_packages: 25
  evidence_max_chars: 2000
  cache_path: outputs/dependency-report-cache.json
  cache_ttl_hours: 168
  cache_max_entries: 500
```

The deterministic metadata includes release dates, available homepage, repository, and changelog links, plus a bounded release-note excerpt. JSON `release_info` objects also include:

- `source`: `github_release`, `github_raw`, or `none`
- `source_status`: `success`, `fallback`, `link_only`, `unavailable`, or `error`
- `source_reason`: diagnostic text when resolution was incomplete
- `release_url`: the matched GitHub release or releases page
- `matched_versions`: release tags included in the excerpt
- `is_range_complete`: whether the requested version range was resolved completely

Upgrade planning rows include the project path so repeated packages across projects are easy to distinguish.

The app-generated configuration enables release intelligence by default when dependency report execution is enabled. Set `DEPENDENCY_REPORT_RELEASE_INTELLIGENCE_ENABLED=false` to disable it for app-triggered runs.

## Testing Release Intelligence

The normal test suite is deterministic and does not make network requests:

```bash
PYTHONPATH=tools/dependency-reporter \
python3 -m unittest discover -s tools/dependency-reporter/tests -p 'test_*.py'
```

An opt-in live smoke test calls the public GitHub Releases API for `yorah/dockbrr` and exercises real release matching:

```bash
RUN_LIVE_CHANGELOG_TESTS=1 \
PYTHONPATH=tools/dependency-reporter \
python3 -m unittest tools.dependency-reporter.tests.test_live_release_intelligence
```

The live test is excluded unless `RUN_LIVE_CHANGELOG_TESTS=1` is set, so ordinary CI and local test runs remain independent of network availability.

## Optional AI Summaries

AI summaries are optional enrichment and use an OpenAI-compatible `/chat/completions` endpoint. The deterministic dependency and release report is written first, so AI latency does not hide the useful result. Keep `ai.enabled: false` to generate release metadata without model calls. Equivalent upgrades share one cached analysis across legitimate projects and runs; `max_packages` applies to unique candidates. A failed or timed-out request leaves the report readable and adds a warning rather than failing the dependency scan.

Use a fast non-reasoning model for this short structured recommendation task when selecting a deployment. The model and endpoint remain deployment-owned; Project Hub does not replace them. Optional completion and reasoning parameters are sent when supported by the configured endpoint and may fall back for compatible endpoints that reject them.

Ollama example:

```yaml
ai:
  enabled: true
  base_url: http://localhost:11434/v1
  model: llama3.1
  api_key_env: OLLAMA_API_KEY
```

For an OpenAI-compatible endpoint that does not require authentication, leave `api_key_env` empty:

```yaml
ai:
  enabled: true
  base_url: https://llm.internal/v1
  model: local-model
  api_key_env:
```

OpenAI example:

```yaml
ai:
  enabled: true
  base_url: https://api.openai.com/v1
  model: gpt-4.1-mini
  api_key_env: OPENAI_API_KEY
  completion_tokens: 300
  prompt_schema: dependency-summary-v1
  # Optional; only send when the endpoint supports it.
  # reasoning_effort: low
```

If AI is enabled, the prompt asks the model to use only fetched metadata and release-note excerpts, avoid inventing release notes, and return structured JSON with:

- `priority`
- `risk`
- `suggested_action`
- `notable_changes`
- `breaking_changes`
- `evidence_urls`
- `summary`

Structured values are rendered in `Upgrade Recommendations`; plain text fallback responses are rendered in `Upgrade Notes`.

The app exposes the enrichment state (disabled, skipped, pending, in progress, partial, or completed) and per-run progress/metrics, including unique candidates, cache hits, requests, failures, elapsed time, and provider-reported prompt, completion, reasoning, and total token counts. Missing usage fields are shown as unavailable rather than estimated. Local metrics intentionally omit full prompts, model responses, authorization data, and release-note bodies.
