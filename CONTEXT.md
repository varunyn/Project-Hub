# Project Hub Context

## Glossary

### Project

A codebase tracked by Project Hub, with its own summary, working context, and activity history.

### Task

A unit of work that belongs to exactly one Project and moves through the project workflow.

### Task status

The workflow stage of a Task: Backlog, Todo, In Progress, Review, or Done.

### Task priority

The relative urgency of a Task: low, medium, or high.

### GitHub-linked Task

A Task associated with a GitHub issue so selected Task changes can be mirrored to GitHub.

### GitHub synchronization state

The durable result of attempting to mirror a GitHub-linked Task's status to its associated GitHub issue: pending, synced, or failed. A failed state retains when the attempt occurred and a safe error summary; retry always mirrors the Task's current local status rather than replaying an older change. Existing Tasks without this state remain valid until their next synchronization attempt.

### GitHub link reservation

A durable marker that prevents concurrent GitHub issue creation attempts for the same Task. The reservation is recorded before issue creation and cleared when linking completes. If GitHub definitely succeeds but local linking fails, retry attaches the known issue instead of creating another; an uncertain GitHub outcome blocks automatic creation until explicitly resolved. Resolution either attaches a verified existing issue or clears the reservation after verification that no issue was created. A Task with an unresolved reservation cannot be deleted.

### Project task workspace

The operational surface where a Project's Tasks are searched, filtered, reordered, edited, and reviewed.

### Task board

A reusable module that renders a Project task workspace. It owns board and list views, drag-and-drop reordering, search and priority filtering, task selection, and the task detail panel, while delegating data fetching and persistence to its parent through callbacks.
