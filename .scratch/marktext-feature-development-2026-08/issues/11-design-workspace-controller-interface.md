# 设计 WorkspaceController 深模块 interface

Type: `grilling`
Status: `open`
Blocked by: 04

## Question

Define the deep `WorkspaceController` module's external interface and seam. Hide the document registry, pane reducer, focus routing, editor adapters, event scoping, and session snapshot plus migration inside its implementation. Decide the small set of commands, results, errors, and invariants that callers must know. Introduce production adapters and an in-memory test adapter only where two adapters justify the seam. Make the interface the test surface, replacing rather than layering on the old shallow global-store and event tests.

## Comments

- This is a high-risk shared-editor and persistence seam. Resolve it with `codebase-design` and `domain-modeling`, then require an independent `gpt-5.6-terra` at `high` review before implementation handoff.
