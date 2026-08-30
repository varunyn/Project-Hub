# Project Hub MCP Server

The Project Hub MCP server is a TypeScript stdio server for MCP-compatible coding agents. It uses the same TypeScript domain utilities and JSON data files as the Next.js app, so projects and tasks have one implementation of their rules.

## Tools

| Tool | Description |
| --- | --- |
| `list_projects` | List all projects |
| `get_project(project_id)` | Get one project |
| `search_projects(query?, status?, tech?)` | Search projects |
| `list_tasks(project_id?, status?, priority?, query?)` | List and filter tasks |
| `get_task(task_id)` | Get one task |
| `create_task(project_id, title, ...)` | Create a task |
| `update_task(task_id, ...)` | Update a task |
| `delete_task(task_id)` | Delete a task |
| `add_project(name, path, ...)` | Add a project |
| `update_project(project_id, ...)` | Update a project |
| `delete_project(project_id)` | Delete a project |
| `get_dependency_report()` | Get the latest dependency report |
| `get_project_dependency_updates(project_id_or_path)` | Get updates for one project |
| `search_dependency_updates(package?, ecosystem?, project?, risk?)` | Search dependency updates |

Read-only tools are annotated with `readOnlyHint` and `openWorldHint: false`; delete tools are annotated as destructive.

## Resources and prompts

The server also exposes the existing `project-hub://` project, task, and dependency-report resources and the `review_dependency_update_prompt` prompt.

## Setup

The server uses Node.js and the standard MCP stdio transport. Build the app and MCP server from the repository root:

```bash
pnpm install
pnpm build
```

The compiled server is generated at `mcp/dist/mcp/server.js` and is intentionally ignored by Git.

### Client configuration

Configure an MCP server named `project-hub` with:

```json
{
  "command": "node",
  "args": ["<path-to-project-hub>/mcp/dist/mcp/server.js"]
}
```

The repository includes `mcp/cursor-mcp-config.example.json` for Cursor-style configuration. Replace the placeholder with the absolute repository path. Re-run `pnpm build` after changing the MCP server or shared domain code.

The server must keep stdout reserved for MCP messages; diagnostics are written to stderr. The MCP build rewrites generated relative imports for native Node.js ESM compatibility.

## Data location

The server uses `app/data/projects.json` and `app/data/tasks.json` relative to the repository root by default. Set `PROJECT_DATA_DIR` to use another data directory. `HOST_PROJECTS_ROOT` and `CONTAINER_PROJECTS_ROOT` preserve project-path mapping when the app is run in a container.

Project and task writes use separate cross-process lock files and atomic replacement, allowing the app and MCP server to safely update JSON storage concurrently.
