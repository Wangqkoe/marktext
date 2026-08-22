# Candidate evidence record: `W3-QUEUED-OWN-SAVE-EVENT-ORDER`

## Identity and environment

- Observed at (local date/time and timezone): 2026-08-22 -07:00 during independent Ticket 02A review.
- Git baseline: `463df5d1ad96ccb2129f0592cc7a9a2b66a21cf6`; the finding applies to the emergency repair in local commit `26b09ea6` before review remediation and is repaired by local commit `6e4b113c`.
- OS and runtime: Windows 64-bit; MarkText `0.20.0-rc.1`, Electron `42.1.x`.
- Profile mode: isolated `w3-queued-own-save-events` Electron profile and disposable audit fixture.
- Repository constraint: user-owned untracked `AGENTS.md` and `CONTEXT.md` remained untouched; nothing was pushed.

## Input and controlled clean state

- Fixture: F3 Unicode/space path audit document in a disposable directory.
- Exact action sequence: enable 100 ms auto-save; make and observe saves A and B; change the auto-save delay to 3000 ms; make pending edit C while the coalesced watcher event for A/B is still eligible.
- Minimized seam: queue an older saved-content hash followed by a newer hash, place the newer bytes on disk, and call `_shouldIgnoreEvent` once.

## Expected and actual behavior

- Expected: the watcher scans eligible own-save records until the current disk bytes match. An older mismatch must not prevent a newer save from matching, and matching an older event must not consume a newer queued record.
- Actual before remediation: the first eligible record was removed before verification and its hash mismatch returned `false` immediately. In the Electron scenario this produced either a false external-change notification or cancellation of a pending auto-save.
- Actual after the first remediation: active mismatches were retained and scanning continued; however, independent review found that concurrent async callbacks could still mutate the queue around an awaited disk read.
- Actual after concurrency remediation: same-window/same-path checks are serialized; a match consumes itself and older superseded records while preserving newer records. No false notification appears and edit C reaches disk.

## Reproduction and classification

- Pre-repair reproduction: minimized unit regression failed deterministically; Electron regression failed 2/2, once by false conflict notification and once by the expected save not reaching disk.
- Concurrency reproduction: a controlled pair of overlapping disk reads returned `[true, false]` before serialization; after repair it returns `[true, true]` and proves a maximum of one active read.
- Post-repair controls: watcher unit target 5/5; full unit suite 772 passed with 1 skipped; original P0 plus queued-save regressions 8/8 across four parallel workers; final full Electron suite 250 passed, 4 skipped, and only the two separately recorded find-navigation P2 cases failed.
- Severity: P2, high-risk persistence correctness.
- Severity rationale: manual save remains available and no already persisted external bytes were shown lost in this scenario, so it is not P0/P1. It nevertheless invalidates acceptance of the P0 repair because a legitimate rapid-save watcher event can interrupt the core auto-save workflow and present a false conflict.
- Final disposition: confirmed, repaired by `6e4b113c`, and accepted by the final independent Standards + Spec re-review.
- Deferred observations: repeated E2E lifecycle setup and missing direct stat/read-failure branch coverage are maintenance-only; the unrelated find-navigation P2 and W1 synthetic-input automation candidate remain separately recorded and unchanged.
