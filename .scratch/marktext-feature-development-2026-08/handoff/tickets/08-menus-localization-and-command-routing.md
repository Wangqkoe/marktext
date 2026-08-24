# T08 — Menus, localization, and focused-pane commands

Wave: 5 · Risk/model: medium — `gpt-5.6-terra` / `medium` · Depends on: T02, T03, T06

## Result

Expose the three accepted workspace actions only through the tab context menu and
localized command descriptions, all routed through WorkspaceController's focused
pane. It does not own feature semantics, transport, native capture, application-
menu additions, or visual details behavior.

Inputs: [V1 Spec](../v1-spec.md), [Issue 02](../../issues/02-define-cross-window-transfer-contract.md),
[Issue 05](../../issues/05-prototype-split-layout-and-motion.md).

## Ownership and boundary

Own existing `packages/desktop/src/renderer/src/contextMenu/tabs/{index,actions,menuItems}.ts`,
`renderer/src/commands/{index,descriptions}.ts`, and the actual desktop UI locale files
`packages/desktop/static/locales/{de,en,es,fr,ja,ko,pt,tr,zh-CN,zh-TW}.json` for
new strings. `src/main/menu/` action/template files may change only if an existing
current-document command must route to FocusedPane; they must not add Move, Open or
Split Right. Own new `packages/desktop/test/unit/specs/menu-workspace.spec.ts`. Do
not edit `packages/muya/src/locales/`, editor/pane UI, filesystem, transfer
internals, preload or details source/styles.

Order menu group exactly Move, Open, Split Right after a divider. Move enables for
saved/dirty/untitled; Open disables for untitled and explains dirty disk-copy;
left split is drag-only. Commands must carry explicit IDs/focused pane and report
needs-decision/rejected/failed without stale ambient state.

## Acceptance and handoff

Run `pnpm -C packages/desktop exec vitest run test/unit/specs/menu-workspace.spec.ts test/unit/specs/i18n.spec.ts`,
`pnpm minify-locales`, `pnpm lint`, `pnpm -C packages/desktop typecheck`, and diff
check. Manual checks: tab-menu divider/order, translations, disabled untitled Open,
dirty Open decision, keyboard/tab-menu route to the focused pane, and no new
application-menu item. Regression: existing tab context menu and existing main-menu
focused-document routing. Commit only owned menu/locale/tests; an
independent review verifies no menu bypasses controller preconditions.
