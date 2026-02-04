# Project Hub MCP Server

FastMCP server so AI agents (Cursor, Claude, etc.) can **query**, **add**, and **update** projects in your Project Hub app. It reads and writes the same `app/data/projects.json` file as the Next.js app.

## Tools

| Tool | Description |
|------|-------------|
| `list_projects` | List all projects |
| `get_project(project_id)` | Get one project by ID |
| `search_projects(query?, status?, tech?)` | Search by name/path, status, or tech stack |
| `add_project(name, path, ...)` | Add a new project |
| `update_project(project_id, ...)` | Update an existing project |
| `delete_project(project_id)` | Delete a project |

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

## Data location

The server uses `app/data/projects.json` relative to the app root. It resolves this path from the server script location, so it works no matter where you run the command from.
