# Ticket 01 audit fixtures and evidence procedure

`packages/desktop/test/e2e/audit-fixtures.ts` is the fixture factory for this audit batch. It deliberately creates its inputs outside the repository, so no audit command writes a user document or tracked fixture.

## Fixtures and profiles

| ID | Generated input |
| --- | --- |
| F1 | A new app window with no document argument and a fresh profile: the blank unsaved document. |
| F2 | A temporary byte-for-byte copy of `packages/desktop/test/e2e/data/all-blocks.md`. Never save to the tracked source fixture. |
| F3 | `F3 path with spaces 中文/CJK 中文 emoji 😀.md`, with CJK text, emoji, CRLF bytes, and `assets/audit-image.png` referenced relatively. |
| F4 | A generated 240-section document (over 30 KB) containing prose and tables for input, scroll, source-mode, and save stability checks. |

`createAuditRun()` allocates a unique disposable run root in `%TEMP%/marktext-audit-*` by default. Each independent flow obtains a new `isolated-<flow>-*` profile via `createIsolatedUserDataDir()`. Restart/session/Preferences checks use only `shared-restart-persistence` from that same run. Pass every factory-created profile to Electron via `run.launchOptionsForUserDataDir(profile)`; this declares the profile caller-owned, so the shared launcher will not delete it at process exit. Disposable runs remove their root through `run.cleanup()`.

Set `MARKTEXT_AUDIT_ARTIFACT_DIR` only to an existing, writable directory **outside** this repository when retaining a manual run. The factory canonicalizes the configured path (including Windows casing and junction resolution), rejects the repository root and its descendants, creates a unique `marktext-audit-*` child, and makes `run.cleanup()` a preservation no-op. Remove retained evidence manually after it is no longer needed.

## Commands and artifact locations

Run the fixture guard and both repaired-report baselines from the repository root:

```powershell
pnpm --filter marktext exec playwright test test/e2e/audit-fixtures.spec.ts
pnpm --filter marktext exec playwright test test/e2e/editor-input.spec.ts
pnpm --filter marktext exec playwright test test/e2e/preference-switch-contrast.spec.ts
```

Playwright’s failure traces/screenshots are under `packages/desktop/test-results/` and `packages/desktop/playwright-report/` (ignored). Retained manual fixture/profile material goes under the selected `MARKTEXT_AUDIT_ARTIFACT_DIR`; record its exact absolute path in the candidate record. Committed evidence records and templates are under `.scratch/marktext-bug-audit-execution/`. Treat original user documents as read-only: copy them to an audit run before opening or saving.

## Candidate evidence record

Create one record from [candidate-record-template.md](candidate-record-template.md) for every observation, including rejected, environment-only, automation-only and inconclusive results. Do not delete a record merely because it does not become a product fix.

For deterministic candidates, reproduce from the stated clean state twice on the same commit. For intermittent candidates, run at most ten attempts and confirm only at two or more failures. A strongly evidenced P0/P1 is preserved immediately; subsequent attempts use copies and isolated profiles.
