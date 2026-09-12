# 06 — Resolve uncertain GitHub link reservations

**What to build:** Let web and MCP callers explicitly resolve an uncertain GitHub issue-creation outcome by attaching a verified issue or confirming that no issue exists before clearing the reservation.

**Blocked by:** 05 — Reserve GitHub issue linking and recover known partial links.

**Status:** ready-for-agent

- [ ] The Task workflow exposes a named GitHub link-resolution operation requiring Project identity and Task identity.
- [ ] One explicit resolution attaches a verified GitHub issue identity and location to the reserved Task without creating another issue.
- [ ] A second explicit resolution clears the reservation only after the caller confirms that no GitHub issue was created.
- [ ] Resolution validates the Task, Project, reservation, and supplied issue details before changing local state.
- [ ] Automatic reservation expiration, automatic clearing, and automatic issue recreation remain prohibited for uncertain outcomes.
- [ ] Successful attachment clears the reservation and synchronizes the verified issue with the Task's current status.
- [ ] Clearing a verified-empty reservation permits a later fresh linking attempt.
- [ ] Task deletion remains blocked until the reservation is resolved and succeeds normally afterward without modifying GitHub.
- [ ] The Project task workspace presents the two explicit recovery choices and makes their consequences clear.
- [ ] The MCP adapter exposes additive resolution capability with the same invariants and transport-neutral failures.
- [ ] Interface-level tests cover verified attachment, verified clearing, invalid resolution, missing reservation, status synchronization after attachment, and deletion before and after resolution.
- [ ] End-to-end verification confirms current web and MCP operations no longer bypass the Task workflow for any in-scope mutation.
- [ ] The final Unreleased changelog entries are accurate, user-facing, non-duplicative, and state that the change is non-breaking with no migration required.
