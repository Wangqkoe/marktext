# 07: Investigate Opened Files scale pressure

**What to build:** Establish why the application becomes less responsive when 100 or more documents are present in Opened Files, separating the list's own rendering from background document work, subscriptions, and broader resource pressure. Produce repeatable evidence, a user-impact severity assessment, and a narrow follow-up recommendation without implementing an unconfirmed optimization.

**Blocked by:** None (can start immediately)

**Status:** complete — independent-review blockers repaired; red-capable diagnosis, exact capacity boundary, raw environment/input evidence, and bounded conclusions recorded in `../evidence/07-opened-files-scale-pressure.md`; no production fix implemented

**Input limitation:** native wheel passed. The automated physical scrollbar-thumb drag was attempted but did not move Chromium's overlay/native thumb, so it is recorded as **Unavailable**. Programmatic container positioning is diagnostic only and is not counted as direct scrollbar acceptance.

**Capacity boundary:** exact renderer-ready batches completed at 20/20, 100/100, and 150/150 in every trial. Startup batches independently plateaued short despite every main-process send, localizing a delivery-readiness race rather than a 100/150-item capacity ceiling.

- [x] A deterministic corpus and procedure create at least 100 real Opened Files while recording document size, content shape, opening method, elapsed setup time, and application resource use.
- [x] Baselines at smaller counts and repeated 100-plus-item runs establish how startup/load time, settled responsiveness, memory, task time, and scrolling frame gaps scale with the number of opened documents.
- [x] The Opened Files region is tested after a clearly recorded settled state: native wheel input passes, physical scrollbar-thumb automation is attempted and explicitly reported Unavailable, and programmatic positioning is not substituted for input acceptance.
- [x] Causal comparisons isolate, as far as evidence permits, list rendering or DOM scale, hidden/background editor or document work, store subscriptions and projection updates, and general CPU or memory pressure.
- [x] The investigation verifies whether scrolling the Opened Files container enters the WYSIWYG scroll-report path or demonstrates that the observed pressure is independent.
- [x] Profiling covers the actual bulk-open slow phase, identifies a material Pinia facade/projection contributor without assigning unsupported complete causality, and raw measurements retain application, runtime, OS/CPU/RAM, viewport/container, cadence, fixture, delivery, resource, and trial context.
- [x] Any setup boundary, renderer instability, memory ceiling, or inability to reach larger counts is reported explicitly as capacity evidence rather than omitted.
- [x] Severity is assigned from reproducibility, realistic user scale, responsiveness, and risk of an unusable or unstable workspace.
- [x] The conclusion names confirmed contributors, ruled-out dominant causes, remaining uncertainty, and separate minimal reliability/performance follow-up seams supported by evidence.
- [x] A follow-up recommendation states whether a repair specification is warranted and proposes its user-visible scope, acceptance thresholds, and non-goals.
- [x] No production fix, speculative virtualization, shared scroll runtime, or unrelated cleanup is implemented as part of this investigation.
- [x] Findings remain independent from WYSIWYG acceptance unless direct evidence demonstrates a shared causal bottleneck.
