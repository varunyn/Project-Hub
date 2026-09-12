# 03 — Make GitHub-linked Task status local-first

**What to build:** Save a GitHub-linked Task's status in Project Hub before mirroring it to GitHub, retain the synchronization result durably, and give web and MCP callers identical behavior when GitHub succeeds or fails.

**Blocked by:** 02 — Unify Task updates and deletion behind the Task workflow.

**Status:** ready-for-agent

- [ ] A linked Task status change atomically stores the new local status and a pending GitHub synchronization state before the GitHub adapter is invoked.
- [ ] Only Task status is mirrored automatically; title, description, priority, assignee, ordinary labels, due date, and position remain local.
- [ ] Successful mirroring changes synchronization state from pending to synced and records when synchronization completed.
- [ ] Failed mirroring preserves the local Task status, changes synchronization state to failed, and stores an attempt time with a safe error summary.
- [ ] Update returns the Task plus an explicit synchronization outcome of not required, synced, or failed.
- [ ] Web and MCP status updates cross the same workflow seam and produce equivalent Task and GitHub behavior.
- [ ] Existing linked Tasks without synchronization state remain valid and acquire state lazily on their next status change.
- [ ] Internal attempt identity and guarded completion prevent an older GitHub response from overwriting a newer synchronization state.
- [ ] Concurrent status changes converge GitHub toward the latest local Task status without exposing attempt mechanics through the workflow interface.
- [ ] The production GitHub adapter implements status mirroring behind an internal seam, while tests use a programmable mock adapter.
- [ ] The Project task workspace displays durable synchronization failure information without treating the local update as failed.
- [ ] Interface-level tests prove local-first ordering, success, failure, safe errors, legacy compatibility, stale completion protection, and concurrent convergence.
- [ ] The Unreleased changelog explains that Project Hub now preserves local status changes during GitHub failures and that no migration is required.
