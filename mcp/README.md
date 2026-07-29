# Project Hub MCP Server

FastMCP server so AI agents (Cursor, Claude, etc.) can **query**, **add**, and **update** projects and tasks in your Project Hub app. It reads and writes the same `app/data/projects.json` and `app/data/tasks.json` files as the Next.js app.

## Tools

| Tool                                      | Description                                |
| ----------------------------------------- | ------------------------------------------ |
| `list_projects`                           | List all projects                          |
| `get_project(project_id)`                 | Get one project by ID                      |
| `search_projects(query?, status?, tech?)` | Search by name/path, status, or tech stack |
| `list_tasks(project_id?, status?, priority?, query?)` | List and filter tasks across projects |
| `get_task(task_id)`                    | Get one task by ID                         |
| `create_task(project_id, title, ...)`  | Create a task in a project                 |
| `update_task(task_id, ...)`             | Update task fields or workflow position    |
| `delete_task(task_id)`                  | Delete a task                              |
| `add_project(name, path, ...)`            | Add a new project                          |
| `update_project(project_id, ...)`         | Update an existing project                 |
| `delete_project(project_id)`              | Delete a project                           |
| `get_dependency_report()`                 | Get the latest dependency tracker report   |
| `get_project_dependency_updates(project_id_or_path)` | Get dependency updates for one project |
| `search_dependency_updates(package?, ecosystem?, project?, risk?)` | Search package-level dependency updates |

Read-only tools include FastMCP annotations with display titles, `readOnlyHint`, and `openWorldHint: false` so clients can treat them as local data lookups.

## Resources

| Resource URI | Description |
| --- | --- |
| `project-hub://projects` | Read-only snapshot of tracked projects |
| `project-hub://tasks` | Read-only snapshot of tasks across projects |
| `project-hub://projects/{project_id}/tasks` | Read-only tasks for one project |
| `project-hub://dependency-report/latest` | Latest dependency tracker report |
| `project-hub://projects/{project_id_or_path}/dependency-updates` | Dependency tracker details for one project |

## Prompts

| Prompt | Description |
| --- | --- |
| `review_dependency_update_prompt(package_name, project_id_or_path?)` | Guides an agent through a dependency update review using report evidence |

## Setup

This project uses **uv** for the MCP server. MCP is configured in **`.cursor/mcp.json`** at the repo root, so Cursor will pick it up when you open this project.

### Prerequisites

- [uv](https://docs.astral.sh/uv/) installed (`curl -LsSf https://astral.sh/uv/install.sh | sh` or `brew install uv`).

### Cursor (project config)

The repo already includes `.cursor/mcp.json` with:

- **command:** `uv`
- **args:** `["run", "--directory", "${workspaceFolder}/mcp", "server.py"]`

No extra setup needed: open the project in Cursor and the **project-hub** MCP server will be available. Restart Cursor or reload MCP if it doesn’t show up.

### Run the server manually (optional)

From the app root:

```bash
uv run --directory mcp server.py
```

### Run over HTTP (optional)

For remote or non-stdio clients:

```bash
uv run --directory mcp fastmcp run server.py:mcp --transport http --port 8000
```

Then connect to `http://localhost:8000/mcp`.

### Run through Docker Compose (optional)

The main UI container does not start MCP by default. To run MCP as an optional HTTP sidecar, enable the `mcp` profile:

```bash
docker compose --profile mcp up -d --build
```

This keeps the UI at `http://localhost:3080` and exposes MCP at `http://localhost:8070/mcp` by default. Set `MCP_HTTP_PORT` in `.env` to use a different host port.

The MCP service uses the same data and project mounts as the UI:

- `${PROJECT_DATA_PATH:-./app/data}` is mounted at `/app-data`
- `${HOST_PROJECTS_PATH}` is mounted at `/projects`

Use plain `docker compose up -d` when you only want the UI.

## Data location

The server uses `app/data/projects.json` relative to the app root. It resolves this path from the server script location, so it works no matter where you run the command from.

Dependency tracker tools read the latest `dependency-report-YYYY-MM-DD.json` from `app/data/dependency-reports` by default. Set `PROJECT_DATA_DIR` to move both project data and dependency reports together, or set `DEPENDENCY_REPORT_OUTPUT_DIR` to point at a different dependency report folder.
