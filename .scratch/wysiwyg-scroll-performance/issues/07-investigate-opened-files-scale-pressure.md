# 07: Investigate Opened Files scale pressure

**What to build:** Establish why the application becomes less responsive when 100 or more documents are present in Opened Files, separating the list's own rendering from background document work, subscriptions, and broader resource pressure. Produce repeatable evidence, a user-impact severity assessment, and a narrow follow-up recommendation without implementing an unconfirmed optimization.

**Blocked by:** None (can start immediately)

**Status:** complete — diagnosis recorded in `../evidence/07-opened-files-scale-pressure.md`; no production fix implemented

**Input limitation:** native wheel and deterministic direct native-container positioning passed; a physical scrollbar-thumb drag was attempted but could not grip the thumb in headless Electron, so physical-thumb acceptance remains untested and is called out in the evidence.

- [x] A deterministic corpus and procedure create at least 100 real Opened Files while recording document size, content shape, opening method, elapsed setup time, and application resource use.
- [x] Baselines at smaller counts and repeated 100-plus-item runs establish how startup/load time, settled responsiveness, memory, task time, and scrolling frame gaps scale with the number of opened documents.
- [x] The Opened Files region is tested with native wheel input and direct scrollbar interaction after the workspace has reached a clearly recorded settled state.
- [x] Causal comparisons isolate, as far as evidence permits, list rendering or DOM scale, hidden/background editor or document work, store subscriptions and projection updates, and general CPU or memory pressure.
- [x] The investigation verifies whether scrolling the Opened Files container enters the WYSIWYG scroll-report path or demonstrates that the observed pressure is independent.
- [x] Profiling evidence identifies the dominant work during slow interactions, and raw measurements retain application, runtime, machine, cadence, fixture, and trial context.
- [x] Any setup boundary, renderer instability, memory ceiling, or inability to reach larger counts is reported explicitly as capacity evidence rather than omitted.
- [x] Severity is assigned from reproducibility, realistic user scale, responsiveness, and risk of an unusable or unstable workspace.
- [x] The conclusion names confirmed causes, ruled-out causes, remaining uncertainty, and the smallest remediation seam supported by evidence.
- [x] A follow-up recommendation states whether a repair specification is warranted and proposes its user-visible scope, acceptance thresholds, and non-goals.
- [x] No production fix, speculative virtualization, shared scroll runtime, or unrelated cleanup is implemented as part of this investigation.
- [x] Findings remain independent from WYSIWYG acceptance unless direct evidence demonstrates a shared causal bottleneck.
