# 02 — Unify Task updates and deletion behind the Task workflow

**What to build:** Make ordinary Task updates and deletion consistent across web and MCP through named Task workflow operations, with Project ownership, allowed changes, and Task ordering enforced in one place.

**Blocked by:** 01 — Unify Task creation behind the Task workflow.

**Status:** ready-for-agent

- [ ] Named update and delete operations require both Project identity and Task identity at the workflow seam.
- [ ] The MCP adapter resolves its globally supplied Task identity and optional Project guard before invoking the workflow.
- [ ] Update validation is atomic: an invalid recognized field rejects the whole change before persistence.
- [ ] An empty update is rejected consistently and does not refresh timestamps or reorder Tasks.
- [ ] Ordinary updates cannot directly write GitHub issue identity, GitHub synchronization state, or GitHub link reservations.
- [ ] Moving a Task preserves destination ordering and normalizes positions through the existing deep persistence behavior.
- [ ] Deletion affects only Project Hub, leaves any linked GitHub issue unchanged, and renumbers remaining Task positions.
- [ ] Missing or mismatched Projects and Tasks become transport-neutral workflow failures translated into existing web and MCP conventions.
- [ ] Interface-level tests cover allowed changes, invalid changes, Project ownership, movement, deletion, position normalization, and the absence of GitHub effects.
- [ ] Web and MCP adapters retain their existing public operation shapes and contain no Task mutation policy after migration.
- [ ] The Unreleased changelog describes the corrected Task validation and ordering behavior and states that no migration is required.
