# 05: Validate the installed build against the Scroll Performance Contract

**What to build:** Produce and validate a fresh Windows installer that demonstrates responsive heading-heavy WYSIWYG scrolling under the shared Scroll Performance Contract, including calibrated raw measurements and physical input acceptance. Record comparable coverage for every renderer scrolling or wheel-interaction class without forcing them through a shared runtime, and report unsupported platforms or incomplete scenarios explicitly.

**Blocked by:** 03: Harden scroll ownership across transfer and destruction; 04: Commit programmatic scroll destinations once

**Status:** first automated installed-build phase passed; physical/manual acceptance pending

- [x] A fresh Windows installation package is built from the completed implementation and installed into an isolated acceptance environment rather than validated only as a development build.
- [x] The 400-heading WYSIWYG fixture is run three times in the installed application, and the median of the three per-run proportions of frame gaps greater than 50 ms is no more than 5%.
- [x] Idle requestAnimationFrame cadence, application and runtime versions, machine context, run procedure, per-run results, and raw frame-gap data are retained with the benchmark result.
- [x] If the host's idle cadence makes the 50 ms threshold invalid, the equivalent calibration, reasoning, environment, and unmodified raw data are recorded instead of substituting a visual or single-run judgment. (Idle cadence kept 50 ms applicable; raw data retained.)
- [x] A deterministic automated gate confirms active WYSIWYG scrolling does not publish workspace projections or rebuild TOC/Outline and that final position convergence still occurs.
- [x] The acceptance matrix records fixture scale, input semantics, cadence, frame gaps, response latency, platform, outcome, and limitations for WYSIWYG, Source, Files/Folder tree, Outline, Search, Preferences, Opened Files, tab-strip horizontal scrolling, image-viewer zoom, command palette, and other scrollable popups.
- [ ] Windows manual acceptance separately covers a physical mouse wheel, an available physical touchpad, and dragging the physical scrollbar thumb in the installed application.
- [ ] Manual checks confirm native 1:1 response, no added glide after input stops, correct position through switching, splitting, moving, and closing, and no global interaction regression in sampled non-WYSIWYG surfaces.
- [x] Windows results are reported as Windows-only; Linux and macOS installation, performance, and physical-input statuses are explicitly marked untested unless those platforms are actually exercised.
- [x] Source large-document capacity and Opened Files scale-pressure findings are linked as independent investigations and do not block this ticket once the WYSIWYG thresholds and required acceptance checks pass.
- [x] The final package location, validation evidence, known limitations, and automated-phase pass/manual-pending decision are recorded for a fresh-context reviewer.

First-phase evidence: [installed Windows scroll acceptance](../evidence/05-installed-scroll-acceptance.md).
