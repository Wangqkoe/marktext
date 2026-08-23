# MarkText workspace feature wayfinder

Label: `wayfinder:map`
Status: `exploring`

## Destination

Produce implementation-ready specifications, confirmed interaction prototypes, and an acceptance-backed ticket handoff for three coordinated workspace features: cross-window tabs, a two-pane split workspace, and styled raw-HTML `details` disclosures. This map does not implement product changes.

## Notes

- Consult `wayfinder` for map operations; use `grilling` and `domain-modeling` for decision tickets, and `prototype` for interaction-validation tickets.
- The local integration branch is `codex/marktext-feature-development-2026-08` in `E:\Program Files\Marktext-worktrees\marktext-feature-development-2026-08`.
- Every implementation ticket must use its own worktree and `codex/<ticket-feature-name>` branch. Commits stay local; never push.
- Window/IPC behavior, pane persistence, and shared editor state are high-risk and require `gpt-5.6-terra` at `high` plus independent review. Normal implementation uses `gpt-5.6-terra` at `medium`.

## Decisions so far

- [确定首版产品边界](issues/01-define-v1-product-boundaries.md): the three V1 contracts, lossless Move, disk-backed Open, two-pane limit, standard details preview, and two mandatory prototype gates are accepted.

## Not yet specified

- The concrete IPC/tab-snapshot contract after the window-transfer and lifecycle decision is settled.
- The pane controller and file-ownership seam after the pane-scoped workspace model is settled.
- Platform fallbacks, including behavior where native drag/window boundaries differ.
- The exact CSS and event strategy after both interaction prototypes provide evidence.
- Final implementation-ticket slicing after all decision and prototype gates are resolved.

## Out of scope

- More than two panes, vertical splits, or recursive/nested splitting.
- Showing the same document in both panes.
- Persisting transient `details` click state or parsing Markdown inside raw HTML, unless a future map redraws the destination.
- Preferences redesign.
- Release, publishing, or any remote push.
