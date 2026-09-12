# 04 — Retry failed GitHub status synchronization

**What to build:** Let users and MCP callers explicitly retry a failed GitHub status synchronization while always mirroring the Task's current Project Hub status.

**Blocked by:** 03 — Make GitHub-linked Task status local-first.

**Status:** ready-for-agent

- [ ] The Task workflow exposes a named GitHub status retry operation requiring Project identity and Task identity.
- [ ] Retry reloads the current Task and mirrors its current status rather than replaying the status stored by an earlier failed attempt.
- [ ] Retry marks synchronization pending before invoking GitHub and terminates as synced or failed using the same durable state rules as an initial status change.
- [ ] Retry refuses unlinked or missing Tasks through transport-neutral workflow failures.
- [ ] A newer Task status or synchronization attempt cannot be overwritten by a stale retry completion.
- [ ] The web adapter exposes retry without changing existing Task mutation route shapes.
- [ ] The Project task workspace offers retry when durable synchronization state is failed and displays the resulting state.
- [ ] The MCP adapter exposes additive retry capability using the same workflow operation and failure meaning.
- [ ] Interface-level tests cover retry success, repeated failure, current-status behavior, stale completion, missing configuration, and unlinked Tasks.
- [ ] Thin web and MCP tests cover only input and outcome translation.
- [ ] The Unreleased changelog documents explicit retry as a new recovery capability without a migration requirement.
