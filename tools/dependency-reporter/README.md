# Local Dependency Reporter

Report-only dependency update scanner for local Python and React/Node projects.

## What It Does

- Scans configured parent folders recursively.
- Detects Node projects with `package.json`.
- Detects Python projects with `requirements.txt`, `pyproject.toml`, or `Pipfile`.
- Runs read-only checks for available newer versions.
- Optionally fetches release metadata from PyPI and npm.
- Optionally fetches changelog or release-note text for update planning.
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

Release intelligence is optional and disabled by default. When enabled, the reporter fetches release metadata for outdated direct dependencies from PyPI and npm, fetches available changelog or release-note text, then adds an `Upgrade Planning` section to the Markdown report and `release_info` fields to the JSON report.

```yaml
release_intelligence:
  enabled: true
  max_packages: 25
```

The deterministic metadata includes release dates, available homepage, repository, and changelog links, and a bounded release-note excerpt when a changelog URL is available. Upgrade planning rows include the project path so repeated packages across projects are easy to distinguish.

## Optional AI Summaries

AI summaries are optional and use an OpenAI-compatible `/chat/completions` endpoint. Keep `ai.enabled: false` to generate release metadata without model calls.

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
