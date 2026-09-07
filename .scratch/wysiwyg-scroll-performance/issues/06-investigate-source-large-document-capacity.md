# 06: Investigate Source large-document capacity

**What to build:** Establish a reproducible, causal account of Source mode behavior with large documents so maintainers can distinguish loading and materialization limits from input or scrolling latency. Exercise representative 10,000-line and 50,000-line documents, preserve evidence and environmental limits, assign severity from user impact, and recommend a bounded follow-up specification without implementing an unconfirmed fix.

**Blocked by:** None (can start immediately)

**Status:** completed (independent-review repair: corrected method, raw data, and bounded causal conclusions)

- [x] Deterministic 10,000-line and 50,000-line Source fixtures are defined with document shape, byte size, line characteristics, and heading/content mix recorded.
- [x] The reproduction records time to open the document, time to create the Source surface, the first real keyboard `keydown` to visible DOM update before later sampling, DOM or editor materialization scale, memory pressure, and scroll response; focus/cursor preparation and driver round-trip remain separate readiness fields.
- [x] Each scenario is repeated three times with an isolated profile to separate a stable scale problem from cold-start noise, and raw evidence retains application, runtime, machine, measured window/viewport/container geometry, fixture/profile isolation, ordering timestamps, and idle-cadence context.
- [x] Bounded timeouts and failure states are reported as observed capacity limits rather than silently discarded or converted into scroll samples.
- [x] The causal account excludes the unrelated WYSIWYG scroll-report path and narrows the post-materialization viewport-option result, while explicitly leaving materialization, whole-document processing, parsing/loading, layout/paint, and GC attribution unknown where no discriminating intervention or profile exists.
- [x] The investigation states whether 10,000 and 50,000 lines are usable, degraded, or unavailable, with severity tied to reproducibility and user-visible impact.
- [x] The conclusion identifies confirmed observations, ruled-out or narrowed explanations, remaining uncertainty, severity, and the smallest next diagnostic step without preselecting a virtualization seam.
- [x] A follow-up recommendation says a user-visible repair specification is warranted, proposes acceptance measures and non-goals, and gates implementation-seam selection on causal profiling plus a pre-construction one-variable intervention.
- [x] No production fix, speculative runtime framework, or unrelated refactor is implemented as part of this investigation.
- [x] Findings remain independent from WYSIWYG acceptance unless direct evidence demonstrates a shared causal bottleneck.

Evidence: [Source large-document capacity investigation](../evidence/06-source-large-document-capacity.md)
