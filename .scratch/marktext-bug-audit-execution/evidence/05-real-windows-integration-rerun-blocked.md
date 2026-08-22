# Ticket 05 real Windows integration rerun — input delivery blocked

Date: 2026-08-22 (America/Los_Angeles)

Commit under test: `f2f427d0` (including the historical first blocked-attempt record) on top of `d213fc75`. Environment: Windows 11 Pro 10.0.26200 x64; Node v24.18.0; pnpm 10.33.4; MarkText `0.20.0-rc.1`; Electron 42.1.0. This rerun supersedes neither the prior record nor Ticket 05's pending status. It establishes only an environment/automation limitation, not a product result.

## Fresh controlled state

- The new retained audit root is `C:\Users\1407\AppData\Local\Temp\marktext-windows-integration-audit-rerun\marktext-audit-lgnhY3`; it was created by the existing F1–F4 fixture factory outside the repository.
- Before any UI action, F2 SHA-256 was `2EF766F00EF99274AD14B93A692739BCD96C05202B2158E2C2206048E35AF9C8`; F3 was `51E67D6BDB0D83C32D1A0E9FD28B12D8C70D8DD0B5B806B18366AC2D478BA5CC`; the generated local PNG was `BF780D1105E7CBB81732AF82D45FA3C8A359A130CB5CC6083ABDF296E1445E2A`.
- A new portable profile was created at `C:\Users\1407\AppData\Local\Temp\marktext-windows-audit-electron\marktext-user-data` before launch. Its initial durable buffer contains exactly one empty, saved `Untitled-1` tab with `markdown: ""`, `isSaved: true`, and `wordCount.word: 0`.
- `Get-Command pandoc` returned no command. Pandoc was neither installed nor substituted.

## Computer Use checklist and result

After resetting the Computer Use JavaScript session, `sky.list_apps()` returned no live audit app. `sky.launch_app()` then created exactly one returned `Untitled-1` window owned by the isolated temporary Electron executable. The target was selected afresh, activated, and observed through its accessibility tree. The body exposed the blank-editor prompt and its focused RootWebArea.

The following bounded actions were performed, with a fresh state observation before each action and no reuse of previous screenshot IDs, coordinates, or accessibility indices:

1. The normal `Ctrl+O` command was sent to the focused editor. No Open dialog appeared in a fresh `list_windows()` observation; the editor remained blank.
2. The normal File-menu keyboard path and the custom-title menu control were separately attempted from refreshed state. Neither exposed a native menu or system dialog.
3. A screenshot-backed click was sent to the editor surface. A subsequent accessibility observation again reported the document focused.
4. `M4-UNSAVED-CONTROL` was sent through `sky.type_text`. The refreshed document text did not contain that marker.
5. Following the mandatory refocus-and-retry procedure, the editor was screenshot-clicked again, its focused document state was reobserved, and the same controlled text was sent a second time. The marker was again absent.

Disk provides the independent oracle: the post-attempt `editorStates/*_editor_buffer_store.json` remains `markdown: ""` and `isSaved: true`. Thus the apparent focused-element result is insufficient to prove input delivery. No action was retried after the prescribed refocus retry, and no terminal, Run dialog, Playwright UI driving, or non-Computer-Use Windows UI automation was used.

## M1–M5 disposition

| Check                                | Result                 | Evidence                                                                                 | Final disposition                 |
| ------------------------------------ | ---------------------- | ---------------------------------------------------------------------------------------- | --------------------------------- |
| M1 real Open, Save As, export        | Not executed           | `Ctrl+O` and File-menu routes did not produce a native dialog.                           | environment failure               |
| M2 external clean/dirty modification | Not executed           | A confirmed real open/edit state could not be created.                                   | environment failure               |
| M3 bitmap paste and local drag/drop  | Not executed           | The required editor input is not delivered.                                              | environment failure               |
| M4 unsaved close/restart             | Not executed           | The controlled unsaved marker was absent 2/2 after focus and refocus.                    | environment failure               |
| M5 missing-Pandoc import             | Conversion unavailable | Pandoc absence is verified, but Import cannot be invoked without a working File command. | environment failure / unavailable |

No product defect candidate was observed, no 2/2 product reproduction exists, and the P0/fifth-defect early-stop rule was not triggered. Ticket 05 remains `ready-for-agent`; the execution-map frontier remains Ticket 05, and Tickets 06–07 remain locked. A future rerun needs a desktop path in which Computer Use can demonstrate a visible editor keystroke before continuing M1.
