# 01 — Unify Task creation behind the Task workflow

**What to build:** Make Task creation mean the same thing from the web and MCP by sending both callers through one named Task workflow operation that owns validation, defaults, identity, timestamps, and ordering.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] The Task workflow exposes a named creation operation that accepts the complete Task creation model and requires an existing Project.
- [ ] The workflow owns title normalization and limits, allowed Task status and Task priority values, defaults, identity generation, timestamps, and initial field values.
- [ ] Creation position is calculated while Task persistence is locked so concurrent creations receive valid positions.
- [ ] The web adapter retains its current accepted fields and response behavior while delegating creation policy to the workflow.
- [ ] The MCP adapter retains its current richer input shape and ordinary result behavior while delegating creation policy to the same workflow.
- [ ] Invalid input and missing Projects become transport-neutral workflow failures that each adapter translates into its existing convention.
- [ ] Interface-level tests use real temporary file persistence and prove defaults, complete inputs, validation failures, Project membership, and concurrent position assignment.
- [ ] Adapter tests prove web-shaped and MCP-shaped inputs produce equivalent Task meaning for their shared fields without duplicating workflow tests.
- [ ] Duplicate caller-specific creation rules are removed after both callers migrate.
- [ ] The Unreleased changelog describes the user-visible consistency and concurrent ordering improvement without claiming a breaking change.
