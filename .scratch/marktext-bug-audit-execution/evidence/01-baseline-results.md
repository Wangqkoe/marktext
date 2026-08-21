# Ticket 01 baseline results

Date: 2026-08-21 (America/Los_Angeles)
Commit under test: `6072577af61d5f9ed4f3854153e15d48e8ebc723`
Environment: Windows 11 Pro 10.0.26200 x64; Intel Core i7-10700; Node v24.18.0; pnpm 10.33.4; Electron Playwright against the local desktop package.

The worktree also contained the user-owned untracked `AGENTS.md` and `CONTEXT.md`; neither was opened for modification, staged, or used as an audit fixture.

## Controlled fixture guard

```powershell
pnpm --filter marktext exec playwright test test/e2e/audit-fixtures.spec.ts
```

Result: **1 passed** in 19.7 seconds.

The test created a fresh isolated profile for F1 and observed an empty unsaved document; made a byte-for-byte F2 copy without writing the canonical tracked fixture; verified F3’s Windows path, CJK/emoji text, CRLF bytes and resolvable relative image; generated F4 with 240 sections and more than 30 KB; and created distinct isolated profiles plus the explicitly named shared restart/persistence profile.

## Repaired-report regression baselines

```powershell
pnpm --filter marktext exec playwright test test/e2e/editor-input.spec.ts test/e2e/preference-switch-contrast.spec.ts
```

Result: **11 passed** in 14.9 seconds.

- Loaded-document word count: the `Status-bar word counter` cases passed, including initial loaded content before editing, seeded-tab switching before editing, CJK/ASCII updates, tooltip counts and all display modes. This is a non-regression result for the repair introduced by `d93c259d`.
- Unchecked Preferences switch contrast: the off-switch case passed with a computed effective-track/thumb contrast ratio of at least 3:1. This is a non-regression result for the repair introduced by `948eec8b`.

## Static verification

```powershell
pnpm --filter marktext typecheck
```

Result: passed (`vue-tsc --noEmit -p tsconfig.json`).

No product source was changed, no candidate product defect was recorded, and no command pushed to a remote.
