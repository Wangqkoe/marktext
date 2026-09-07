# 07: Investigate Opened Files scale pressure

**What to build:** Establish why the application becomes less responsive when 100 or more documents are present in Opened Files, separating the list's own rendering from background document work, subscriptions, and broader resource pressure. Produce repeatable evidence, a user-impact severity assessment, and a narrow follow-up recommendation without implementing an unconfirmed optimization.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] A deterministic corpus and procedure create at least 100 real Opened Files while recording document size, content shape, opening method, elapsed setup time, and application resource use.
- [ ] Baselines at smaller counts and repeated 100-plus-item runs establish how startup/load time, settled responsiveness, memory, task time, and scrolling frame gaps scale with the number of opened documents.
- [ ] The Opened Files region is tested with native wheel input and direct scrollbar interaction after the workspace has reached a clearly recorded settled state.
- [ ] Causal comparisons isolate, as far as evidence permits, list rendering or DOM scale, hidden/background editor or document work, store subscriptions and projection updates, and general CPU or memory pressure.
- [ ] The investigation verifies whether scrolling the Opened Files container enters the WYSIWYG scroll-report path or demonstrates that the observed pressure is independent.
- [ ] Profiling evidence identifies the dominant work during slow interactions, and raw measurements retain application, runtime, machine, cadence, fixture, and trial context.
- [ ] Any setup boundary, renderer instability, memory ceiling, or inability to reach larger counts is reported explicitly as capacity evidence rather than omitted.
- [ ] Severity is assigned from reproducibility, realistic user scale, responsiveness, and risk of an unusable or unstable workspace.
- [ ] The conclusion names confirmed causes, ruled-out causes, remaining uncertainty, and the smallest remediation seam supported by evidence.
- [ ] A follow-up recommendation states whether a repair specification is warranted and proposes its user-visible scope, acceptance thresholds, and non-goals.
- [ ] No production fix, speculative virtualization, shared scroll runtime, or unrelated cleanup is implemented as part of this investigation.
- [ ] Findings remain independent from WYSIWYG acceptance unless direct evidence demonstrates a shared causal bottleneck.
