# 05 — Reserve GitHub issue linking and recover known partial links

**What to build:** Prevent duplicate GitHub issues by reserving a Task before issue creation, and safely attach a definitely created issue when final local linking previously failed.

**Blocked by:** 03 — Make GitHub-linked Task status local-first.

**Status:** ready-for-agent

- [ ] The Task workflow exposes a named GitHub issue-linking operation requiring Project identity and Task identity.
- [ ] Linking atomically records a durable GitHub link reservation before invoking the GitHub adapter.
- [ ] A concurrent link attempt observes the reservation and cannot create another GitHub issue.
- [ ] A Task already linked to an issue returns an idempotent already-linked outcome without creating another issue.
- [ ] Successful creation attaches the issue identity and location locally, clears the reservation, and synchronizes the issue with the Task's current status.
- [ ] A definite GitHub failure before issue creation terminates safely without claiming that an issue exists.
- [ ] If GitHub definitely creates an issue but final local attachment fails, the outcome exposes the issue identity and location and retains enough reservation state for recovery.
- [ ] Repeating link for a known partial outcome attaches the known issue and does not call issue creation again.
- [ ] An uncertain GitHub result remains reserved and blocks automatic creation for later resolution.
- [ ] Deleting a Task with an unresolved link reservation is rejected, while deletion continues to leave GitHub issues unchanged.
- [ ] Existing web issue-linking behavior migrates behind the workflow seam and displays linked, already-linked, conflict, and partial outcomes clearly.
- [ ] Interface-level tests use a programmable mock GitHub adapter to cover success, concurrent attempts, known partial recovery, definite failure, uncertainty, status synchronization, and deletion blocking.
- [ ] The Unreleased changelog documents duplicate prevention and partial-link recovery without describing a breaking change.
