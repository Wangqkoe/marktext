# Ticket 04 W4/W5 audit results

Date: 2026-08-22 (America/Los_Angeles)

Baseline commit: `f5d4fdd6` (`f5d4fdd61e20dc6a2e8071e09fe0292b4ca9c467` when this audit began). Environment: Windows 11 Pro 10.0.26200 x64; Node v24.18.0; pnpm 10.33.4; MarkText `0.20.0-rc.1`; local Electron Playwright. Dependencies were installed with the frozen lockfile and the desktop production output was built before the Electron audit. Every independent flow used a fresh factory-created profile and generated F2/F4 copy below the OS temporary directory; no user-owned document was opened for writing.

## W4: F4 under E1

The controlled Electron test ran F4 at E1 (1280x720, 100%, light theme, custom title bar) twice from separate profiles. Each trial scrolled the generated 240-section document, typed one marker through the editor, made a source-mode round trip, saved through the renderer-to-main IPC path, created a second tab and switched back, then inspected the disk file, tab state and renderer-error sink. It ran one F2 control through the identical bounded edit/source/save operation.

| Operation                       |    F4 run 1 |    F4 run 2 | F2 control |       Bound |
| ------------------------------- | ----------: | ----------: | ---------: | ----------: |
| Input marker observable         |   695.60 ms |   752.77 ms |   91.21 ms |  < 5,000 ms |
| Source-mode round trip          | 6,519.82 ms | 6,907.92 ms |  118.27 ms | < 10,000 ms |
| Save completion and disk marker |   118.49 ms |   119.02 ms |  120.53 ms |  < 8,000 ms |

Both F4 trials completed below the defined bounds, preserved their marker after tab switching and saved it to the generated temporary document. No renderer error was captured. The source transition is consistently slower for F4 than the F2 control (about 6.5 seconds versus 0.1 seconds), but it remained within the documented bounded response limit in 2/2 clean runs and did not cause a blocked workflow, process error or data loss. It is a performance observation, not a confirmed regression; host-load noise is not being represented as a product failure because the F4 result was repeated and the F2 control was collected in the same bounded harness.

## W5 representative configuration smokes

- **E2 dark:** F2 changed to the `dark` menu theme, retained `body.dark`, accepted a source-mode edit and rendered its marker in a non-zero, editable editor geometry without renderer errors.
- **E3 640x480:** F2 navigated to the document end, retained editor geometry inside the small viewport, accepted a source-mode edit and saved its disk marker with no renderer errors.
- **E4 125% application zoom:** a fresh F1 window confirmed Electron zoom factor `1.25`, accepted a source-mode input marker, invoked the sidebar menu operation, and kept source/status controls geometrically inside the status bar and viewport. This uses DOM geometry and application/menu state rather than a screenshot.
- **E5 native title bar:** a fresh F2 profile preconfigured `titleBarStyle: native`; it launched without the in-app title bar, performed a source-mode edit and real save, then restarted with the same isolated profile and reloaded the saved marker without renderer errors.

## Commands and disposition

```powershell
pnpm --filter marktext build
pnpm --filter marktext exec playwright -- test test/e2e/audit-large-boundaries.spec.ts
pnpm --filter marktext typecheck
```

The focused Ticket 04 Electron command passed 5/5. The W4 line-targeted control run also passed 1/1 and emitted the timing table above. No anomaly met the deterministic 2/2 or bounded intermittent threshold; no P0/P1 event or fifth confirmed product defect occurred. The accepted P0/02A watcher work and deferred find-navigation P2 were not rerun or reopened. Therefore no candidate evidence record or product repair is created, early stop is false, Ticket 04 is resolved, and Ticket 05 is the newly unlocked frontier.
