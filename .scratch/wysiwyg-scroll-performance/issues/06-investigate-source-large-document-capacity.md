# 06: Investigate Source large-document capacity

**What to build:** Establish a reproducible, causal account of Source mode behavior with large documents so maintainers can distinguish loading and materialization limits from input or scrolling latency. Exercise representative 10,000-line and 50,000-line documents, preserve evidence and environmental limits, assign severity from user impact, and recommend a bounded follow-up specification without implementing an unconfirmed fix.

**Blocked by:** None (can start immediately)

**Status:** completed

- [x] Deterministic 10,000-line and 50,000-line Source fixtures are defined with document shape, byte size, line characteristics, and heading/content mix recorded.
- [x] The reproduction records time to open the document, time to enter Source mode, readiness for input, DOM or editor materialization scale, memory pressure, scroll response, and representative input-to-visible-update latency.
- [x] Each scenario is repeated enough to separate a stable problem from cold-start noise, and raw timing and profiling evidence is retained with application, runtime, machine, and idle-cadence context.
- [x] Bounded timeouts and failure states are reported as observed capacity limits rather than silently discarded or converted into scroll samples.
- [x] Causal interventions distinguish editor materialization or viewport policy, document parsing/loading, renderer main-thread work, and unrelated WYSIWYG scroll reporting as far as the evidence permits.
- [x] The investigation states whether 10,000 and 50,000 lines are usable, degraded, or unavailable, with severity tied to reproducibility and user-visible impact.
- [x] The conclusion identifies confirmed causes, ruled-out causes, remaining uncertainty, and the smallest promising remediation seam.
- [x] A follow-up recommendation says whether a repair specification is warranted and proposes its user-visible scope, acceptance measures, and non-goals.
- [x] No production fix, speculative runtime framework, or unrelated refactor is implemented as part of this investigation.
- [x] Findings remain independent from WYSIWYG acceptance unless direct evidence demonstrates a shared causal bottleneck.

Evidence: [Source large-document capacity investigation](../evidence/06-source-large-document-capacity.md)
