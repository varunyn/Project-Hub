## Problem Statement

Project Hub currently applies Task mutation rules in more than one place. Web requests and MCP tools validate and mutate Tasks differently, and MCP status changes bypass the GitHub behavior used by the web path. For a GitHub-linked Task, GitHub is updated before Project Hub, so GitHub can change even when the authoritative local Task write later fails. Task creation defaults, allowed fields, error behavior, positioning, and link behavior also vary by caller.

Users need every Task mutation to mean the same thing regardless of whether it comes from the Project task workspace, the global Task board, or MCP. Project Hub must remain the source of truth, GitHub synchronization failures must remain visible and recoverable, and concurrent issue-linking attempts must not create duplicate GitHub issues.

## Solution

Introduce one deep Task workflow module beneath the web and MCP adapters. Its named operations own Task creation, update, deletion, GitHub status retry, GitHub issue linking, and GitHub link resolution. Both adapters retain their existing public transport interfaces while translating requests into this shared workflow interface and translating transport-neutral failures back to their existing response conventions.

Task status changes commit to Project Hub first. When the Task is GitHub-linked, the workflow then mirrors only the current Task status to GitHub and durably records the synchronization result as pending, synced, or failed. A failed GitHub attempt does not roll back the local Task. Users can retry explicitly, and retry always mirrors the current local status rather than replaying stale intent.

The workflow records a durable GitHub link reservation before creating an issue. This prevents concurrent creation attempts, supports recovery when a known issue was created but local attachment failed, and blocks unsafe automatic retries when the external outcome is uncertain.

## User Stories

1. As a Project Hub user, I want Task mutations to behave consistently across the web and MCP, so that the caller I use does not change the meaning of my action.
2. As a Project Hub user, I want Project Hub to remain the source of truth for Task status, so that external availability does not determine whether my local work is recorded.
3. As a Project Hub user, I want a Task status change saved locally before GitHub is contacted, so that a GitHub outage does not discard my Project Hub update.
4. As a Project Hub user, I want GitHub synchronization failure to remain visible after refresh, so that external drift is not silently forgotten.
5. As a Project Hub user, I want to retry a failed GitHub status synchronization, so that I can restore alignment after a temporary failure.
6. As a Project Hub user, I want retry to mirror the Task's current status, so that an old failed attempt cannot overwrite a newer decision.
7. As a Project Hub user, I want successful status synchronization recorded durably, so that the app can distinguish confirmed alignment from an unattempted state.
8. As a Project Hub user, I want synchronization-in-progress recorded durably, so that concurrent or interrupted operations have an explicit state.
9. As a Project Hub user, I want a safe error summary for failed synchronization, so that I understand the problem without credentials or sensitive response data being exposed.
10. As a Project Hub user, I want only Task status mirrored automatically, so that local edits to title, description, priority, assignee, labels, or due date do not unexpectedly rewrite a GitHub issue.
11. As a Project Hub user, I want deleting a GitHub-linked Task to leave its GitHub issue unchanged, so that a local cleanup does not silently perform a destructive external action.
12. As a Project Hub user, I want deletion blocked while GitHub issue linking is unresolved, so that an issue cannot finish creating for a Task that no longer exists.
13. As a Project Hub user, I want concurrent issue-link attempts rejected, so that one Task does not accidentally create duplicate GitHub issues.
14. As a Project Hub user, I want a definitely created GitHub issue attached during recovery rather than recreated, so that retry is idempotent when the issue identity is known.
15. As a Project Hub user, I want an uncertain issue-creation result to block automatic recreation, so that network ambiguity does not produce duplicate issues.
16. As a Project Hub user, I want to attach a verified existing issue when resolving an uncertain link, so that the Task can recover without another external creation.
17. As a Project Hub user, I want to clear a link reservation after verifying that no issue exists, so that I can safely attempt linking again.
18. As a Project Hub user, I want an explicit partial outcome containing the created issue location when GitHub succeeds but local attachment fails, so that the external result is not lost.
19. As a web user, I want existing Task routes and client behavior to remain compatible, so that the architectural change does not disrupt my workflow.
20. As an MCP user, I want existing tool inputs and ordinary results to remain compatible, so that current automations continue to work.
21. As an MCP user, I want status updates to honor the same GitHub-linked Task behavior as the web, so that MCP no longer bypasses synchronization policy.
22. As an MCP user, I want explicit status retry and link resolution capabilities, so that I can recover states created through either caller.
23. As a Project Hub user, I want invalid Task input rejected before any local or GitHub change, so that partial effects do not result from validation errors.
24. As a Project Hub user, I want missing Projects and Tasks reported consistently within each caller's existing conventions, so that errors remain understandable without leaking transport rules into Task behavior.
25. As a Project Hub user, I want Task creation defaults and validation centralized, so that equivalent inputs create equivalent Tasks from every caller.
26. As a Project Hub user, I want creation positions calculated while persistence is locked, so that concurrent creation does not assign conflicting positions.
27. As a Project Hub user, I want remaining Tasks renumbered after deletion, so that Task ordering stays contiguous and predictable.
28. As a Project Hub user, I want newer status changes protected from stale GitHub completions, so that slow external calls cannot overwrite current synchronization state.
29. As a Project Hub user, I want existing stored Tasks to remain readable without an eager migration, so that upgrading does not require rewriting project data.
30. As a maintainer, I want one Task workflow interface to contain mutation invariants and ordering, so that fixes have locality and every caller gains the same behavior.
31. As a maintainer, I want web and MCP adapters to contain only request and response translation, so that transport details do not leak into Task workflow policy.
32. As a maintainer, I want GitHub behavior behind a replaceable internal seam, so that external success, rejection, delay, and ambiguity can be tested deterministically.
33. As a maintainer, I want workflow tests to use real temporary file persistence, so that locking, atomic writes, and stored compatibility are verified through the production implementation.
34. As a maintainer, I want bulk GitHub import to remain separate, so that batch reconciliation does not dilute the single-Task workflow interface.

## Implementation Decisions

- Add one deep Task workflow module with named operations for create, update, delete, retrying GitHub status, linking a GitHub issue, and resolving a GitHub link reservation.
- Every operation that targets an existing Task requires both the Project identity and Task identity. The MCP adapter resolves a globally supplied Task identity before crossing the workflow seam.
- The workflow interface accepts the complete Task creation model. Existing web and MCP adapters retain their current accepted fields and translate them into that shared model.
- The workflow owns Task validation, normalization, default status and priority, identity generation, timestamps, position calculation, Project membership checks, and Task ownership checks.
- Callers cannot directly mutate GitHub issue identity, GitHub synchronization state, or GitHub link reservations through the ordinary update operation.
- Creation position is calculated inside the persistence lock. Deletion renumbers the remaining Tasks to preserve ordering invariants.
- The existing deep file-persistence implementation remains behind the workflow implementation. No new public persistence port is introduced.
- Task status changes are local-first. The local write stores the new status and pending GitHub synchronization state atomically before any GitHub request.
- Only Task status is mirrored for an existing GitHub-linked Task. Other Task fields remain local unless a future specification expands synchronization behavior.
- GitHub success changes synchronization state to synced. GitHub failure changes it to failed with an attempt time and safe error summary, without rolling back the local Task.
- Update and retry return the updated Task plus an explicit synchronization outcome of not required, synced, or failed.
- Retry reads the current local Task status at execution time and never replays a historical failed status.
- Synchronization attempts use internal attempt identities and guarded completion so an older GitHub response cannot replace newer synchronization state.
- When concurrent status changes occur, the implementation converges GitHub toward the latest local Task status while keeping attempt mechanics out of the external interface.
- Deleting a GitHub-linked Task never changes its GitHub issue.
- Existing Tasks without synchronization state remain valid. Synchronization state is populated lazily on the next applicable attempt.
- Expected failures before a local commit use transport-neutral typed workflow errors, including invalid Task, missing Project, missing Task, conflict, missing GitHub configuration, and local persistence failure.
- A GitHub status failure after the local commit is a successful local update with a failed synchronization outcome, not a failed Task mutation.
- Web and MCP adapters translate workflow errors into their existing status, null, false, or tool-error conventions without reimplementing Task policy.
- GitHub is a true external dependency behind an internal port. Production uses the GitHub transport adapter; tests use a programmable mock adapter.
- Clock and identity generation may be injected at module construction for deterministic tests but do not appear in the workflow interface.
- The production application uses a configured workflow instance. Tests construct the same implementation with deterministic dependencies.
- GitHub issue linking first stores a durable reservation and then performs issue creation. An unresolved reservation rejects concurrent linking.
- If issue creation definitely succeeds but final local attachment fails, the partial outcome includes the issue identity and location, and retry attaches that known issue instead of creating another.
- If issue creation has an uncertain external outcome, automatic creation remains blocked until explicit resolution.
- Link resolution either attaches a verified existing GitHub issue or clears the reservation after explicit verification that no issue was created.
- A Task with an unresolved GitHub link reservation cannot be deleted.
- Web and MCP expose retry and link-resolution behavior through their respective adapters while retaining existing public interfaces for current operations.
- Web routes and MCP tools migrate to the workflow in the same implementation change so caller divergence is not preserved temporarily.
- Task workflow state additions are optional in stored data, so no eager data migration is required.
- User-visible synchronization state, warnings, retry behavior, and ordering fixes must be documented in the Unreleased changelog when implemented.

## Testing Decisions

- The named Task workflow interface is the highest and primary test seam. Tests exercise observable Tasks, outcomes, errors, and persisted state rather than private helpers or transport orchestration.
- Tests use the real file-backed Task persistence against a temporary data directory, following the existing Task persistence test suite's prior art for isolated filesystem verification.
- Tests use a programmable mock GitHub adapter, following the existing GitHub synchronization test suite's prior art for deterministic external behavior.
- Interface tests cover complete creation validation, defaults, Project membership, generated identity, timestamps, and position behavior.
- Interface tests prove equivalent web-shaped and MCP-shaped inputs produce the same Task meaning after adapter translation.
- Interface tests prove invalid input produces no local or GitHub effect.
- Interface tests prove a linked status change commits locally before invoking GitHub.
- Interface tests prove GitHub failure preserves the local status and stores failed synchronization state with a safe summary.
- Interface tests prove successful GitHub synchronization stores synced state.
- Interface tests prove retry reads the current local status rather than replaying the failed status.
- Interface tests prove stale completion from an older attempt cannot overwrite a newer synchronization result.
- Interface tests prove concurrent status changes converge toward the latest local Task status.
- Interface tests prove non-status Task changes do not call the GitHub adapter.
- Interface tests prove deletion leaves a linked GitHub issue unchanged.
- Interface tests prove deletion renumbers remaining Task positions.
- Interface tests prove creation position assignment remains correct under concurrent writes.
- Interface tests prove the first link attempt records a reservation before the GitHub adapter is called.
- Interface tests prove concurrent link attempts cannot create duplicate issues.
- Interface tests prove a known partial issue creation is attached on retry without another create call.
- Interface tests prove an uncertain issue-creation result remains reserved and blocks automatic recreation.
- Interface tests prove explicit resolution can attach a verified issue or safely clear a reservation.
- Interface tests prove deletion is rejected while a link reservation is unresolved.
- Interface tests prove legacy Tasks without synchronization state remain readable and acquire state lazily.
- Thin adapter tests cover only request parsing and outcome translation for web and MCP; they do not duplicate workflow behavior tests.
- Existing persistence tests remain focused on locking, atomic writes, Project scoping, and position normalization behind the workflow.

## Out of Scope

- Bulk GitHub issue import and Project-wide synchronization.
- Automatically mirroring Task title, description, priority, assignee, ordinary labels, or due date to existing GitHub issues.
- Closing or deleting a GitHub issue when its local Task is deleted.
- Treating GitHub as the source of truth for Task status.
- An automatic background retry queue for failed GitHub synchronization.
- Automatic expiration or clearing of uncertain GitHub link reservations.
- An eager migration that rewrites existing Task data.
- A new public persistence interface or in-memory persistence implementation created only for tests.
- Changes to existing web route shapes or existing MCP tool schemas beyond additive recovery capabilities and synchronization metadata.
- Redesigning Task board state ownership or bulk Task reconciliation.

## Further Notes

- The deletion test supports this module: removing it would force validation, Task ordering, local-first synchronization, durable failure state, retry semantics, reservation handling, concurrency protection, and error translation back into both web and MCP callers.
- The implementation should preserve the existing deep Task persistence module rather than splitting it because of size.
- GitHub synchronization state and GitHub link reservation are defined in the project domain glossary.
- No breaking change or eager migration is expected.
