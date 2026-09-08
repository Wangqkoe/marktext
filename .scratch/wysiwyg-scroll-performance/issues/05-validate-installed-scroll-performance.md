# 05: Validate the installed build against the Scroll Performance Contract

**What to build:** Produce and validate a fresh Windows installer that demonstrates responsive heading-heavy WYSIWYG scrolling under the shared Scroll Performance Contract, including calibrated raw measurements and physical input acceptance. Record comparable coverage for every renderer scrolling or wheel-interaction class without forcing them through a shared runtime, and report unsupported platforms or incomplete scenarios explicitly.

**Blocked by:** 03: Harden scroll ownership across transfer and destruction; 04: Commit programmatic scroll destinations once

**Status:** the first installed build passed its automated performance phase and most Windows manual checks, but manual acceptance found a blocking Move to New Window close defect. The repaired source now has a fresh, isolated Windows package whose installed executable passes the focused Electron regression; final Windows physical re-verification remains pending.

- [x] A fresh Windows installation package is built from the completed implementation and installed into an isolated acceptance environment rather than validated only as a development build.
- [x] The 400-heading WYSIWYG fixture is run three times in the installed application, and the median of the three per-run proportions of frame gaps greater than 50 ms is no more than 5%.
- [x] Idle requestAnimationFrame cadence, application and runtime versions, machine context, run procedure, per-run results, and raw frame-gap data are retained with the benchmark result.
- [x] If the host's idle cadence makes the 50 ms threshold invalid, the equivalent calibration, reasoning, environment, and unmodified raw data are recorded instead of substituting a visual or single-run judgment. (Idle cadence kept 50 ms applicable; raw data retained.)
- [x] A deterministic automated gate confirms active WYSIWYG scrolling does not publish workspace projections or rebuild TOC/Outline and that final position convergence still occurs.
- [x] The acceptance matrix records fixture scale, input semantics, cadence, frame gaps, response latency, platform, outcome, and limitations for WYSIWYG, Source, Files/Folder tree, Outline, Search, Preferences, Opened Files, tab-strip horizontal scrolling, image-viewer zoom, command palette, and other scrollable popups.
- [x] The first-package Windows manual run covered a physical mouse wheel and scrollbar-thumb drag; both were reported responsive with no obvious stalls. No physical touchpad was available, so touchpad behavior remains explicitly unavailable rather than passed.
- [ ] Manual checks confirm native 1:1 response, no added glide after input stops, correct position through switching, splitting, moving, and closing, and no global interaction regression in sampled non-WYSIWYG surfaces.
- [x] Windows results are reported as Windows-only; Linux and macOS installation, performance, and physical-input statuses are explicitly marked untested unless those platforms are actually exercised.
- [x] Source large-document capacity and Opened Files scale-pressure findings are linked as independent investigations and do not block this ticket once the WYSIWYG thresholds and required acceptance checks pass.
- [x] The final package location, validation evidence, known limitations, and automated-phase pass/manual-pending decision are recorded for a fresh-context reviewer.

First-phase evidence: [installed Windows scroll acceptance](../evidence/05-installed-scroll-acceptance.md).

The user reported all sampled transitions and positions normal except one blocking lifecycle path:
after **Move to New Window**, clicking the target window's top-right window close button removed
its tab but left the BrowserWindow open as `New Tab`. A deterministic regression now reproduces
that state from a valid committed crash-draft pair. The minimal repair permits the current window
to exit when `mark-clean` reports only `unresolved crash drafts remain`, while preserving the
process-dirty state and retaining the unrelated recovery draft. Other clean-marker durability
failures still block exit. The original installed executable remains the known-red artifact. A
new repaired executable built from production source commit `6a3dc45a` passes the exact installed
regression from a fresh temporary profile, while the retained old executable still produces the
two-window/`New Tab` failure. Physical acceptance is not claimed until the window-close path and
risk-proportional interaction smoke are manually rechecked. Linux and macOS remain untested.

Independent Spec review found and blocked an unsafe interaction in the first repair: the ordinary
dirty-Document Discard path ignored a failed crash-draft disposition, so the later allowance for
an unrelated recovery draft could also close the current window after its own tombstone failed.
The review repair now stops before `commit-authorized` when the current Document's disposition is
not durable. Its public workspace regression proves that the close request returns false while
the original Document and View remain present and accept another edit. The fresh package is at
`C:\Users\1407\.codex\artifacts\marktext-t05-6a3dc45-repaired-20260907-01\package` and its
isolated installation is at
`C:\Users\1407\.codex\installed\marktext-t05-6a3dc45-repaired`. Installation changed none of
the snapshotted Markdown association, `MarkText.Document`, existing MarkText uninstall-entry, or
shortcut state. Opening an `.md` during installed automation subsequently added the repaired exe
to Explorer's `.md\OpenWithList` MRU without changing the selected ProgID/default; that runtime
MRU change was restored and all 23 association snapshots again match the pre-install bytes. A
future physical run may produce the same Windows MRU entry and must not be described as an
installer association change. An independent synthetic recovery profile now contains the same
valid committed crash-draft pair as the automated regression, so the physical check can retain
the load-bearing unresolved-recovery state while moving and closing the ordinary fixture window.
The fresh-package manual re-verification remains pending.
