# Project Hub

Catalog and manage development projects (names, paths, tech stack, status). Data stored in `app/data/projects.json`.

## Requirements

- Node.js 18+
- pnpm

## Quick Start

```bash
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

## Production (background)

```bash
./start.sh   # build + start on port 3030, logs in logs.txt
./stop.sh
```

## Docker

```bash
cp .env.example .env   # set HOST_PROJECTS_ROOT, CONTAINER_PROJECTS_ROOT if using path mapping
docker compose up -d
```

Mount your projects dir so the app can read git/README (see `.env.example`). “Open in Finder” is unavailable in Docker; use “Copy path” instead.

## Usage

- **Add/Edit/Delete** projects from the dashboard or quick-resume cards (delete asks for confirmation).
- **Open in Finder** — opens folder (macOS only; in Docker, path is copied to clipboard).
- **Open in Cursor / Open in VSCode** — opens project via `cursor://` or `vscode://` URI.

## License

MIT
