# Define reproduction and triage rules

Type: `grilling`
Status: `resolved`
Blocked by: 01; 02

## Question

What minimum evidence confirms a finding as a product bug, and how should the audit distinguish deterministic defects, intermittent defects, expected behavior, environment failures, automation artifacts and unresolved product decisions?

## Comments

- Every confirmed bug needs a command or harness that can catch the reported symptom.
- Intermittent defects need a measured reproduction rate and a bounded stress loop.
- Screenshots and external capture output are supporting evidence, not sufficient proof when application state contradicts them.

## Resolution

### Confirmation thresholds

- A deterministic candidate is confirmed only when it reproduces 2/2 times on the current local commit from a controlled state with a fixed fixture and an application-level oracle.
- An intermittent candidate receives a bounded maximum of 10 attempts. Confirm it at 2 or more failures and record `failures/attempts`; a 1/10 result remains inconclusive and does not consume a confirmed-finding slot.
- On a single data-loss, file-corruption or crash event with strong before/after file evidence, hashes, a stack or process-exit evidence, preserve the scene and pause exploration immediately. Attempt reproduction only with copies or isolated state. Until it meets the confirmation threshold, classify it as `high-severity-pending` rather than modifying code.
- A screenshot or video is supporting evidence only. Visual and interaction findings also need computed style, geometry, accessibility state, hit-testing, operation failure or another application-level result.

### Required evidence package

Every confirmed finding must record:

- the current commit, Windows configuration and whether the user-data directory is fresh or shared;
- the fixed fixture or input file, including relevant content or hash;
- numbered steps that start from a clean, described state;
- the expected result and the contract supporting it;
- the actual result from disk, DOM, application state, error stack, process state or an output artifact;
- the reproduction count and measured failure rate;
- a command, automated test, minimal harness or bounded manual checklist that catches the symptom;
- severity and affected-surface rationale;
- optional screenshots or video as supplementary evidence.

Mark a required field explicitly as not applicable when necessary; do not silently omit it.

### Expected behavior

Resolve expected behavior in this order:

1. an accepted specification or acceptance criterion;
2. Markdown standards or explicit format semantics;
3. an existing automated product contract;
4. stable, internally consistent product interaction.

If the result remains ambiguous, classify it as `product-decision`. Typora is a design reference, not an automatic MarkText functional specification. Existing MarkText behavior alone is not proof that the behavior is correct.

### Triage categories

- `confirmed-deterministic`: meets the 2/2 threshold.
- `confirmed-intermittent`: fails at least 2 times in the bounded 10-run loop.
- `high-severity-pending`: one strongly evidenced P0/P1 event not yet reproduced.
- `inconclusive`: insufficient evidence, including a 1/10 intermittent result.
- `expected-behavior`.
- `environment-failure`.
- `automation-or-capture-artifact`.
- `product-decision`.
- `duplicate-or-baseline-regression`.

Only `confirmed-deterministic` and `confirmed-intermittent` product defects consume the five-finding cap. If a resolved word-count or switch-contrast baseline fails again and is confirmed, record it as a new confirmed regression and count it.

Confirmation does not require locating the introducing commit. Record the current commit and establish the symptom boundary first; bisect later only when history would materially reduce remediation risk.

### Evidence conflicts

When evidence conflicts:

1. rerun from a fresh user-data directory;
2. minimize the input and steps;
3. add a normal control case;
4. verify through a second observation method.

Disk content, process state and application-internal state take precedence over screenshots or capture output. When only automation fails while equivalent real operation and application state are normal, classify the result as `automation-or-capture-artifact` until the harness itself is isolated.

### Manual-only boundaries and candidate retention

An OS-boundary defect that cannot be reliably automated may be confirmed after 2/2 manual reproductions, persistent output or application-level evidence, and an exact bounded checklist. Its eventual repair must also add an automated regression test at the nearest trustworthy code seam.

Retain a concise record for every observed candidate, including its final category and the reason. Store minimized reproduction files under the audit directory. Treat original user files as read-only and do not commit them. Unconfirmed candidates do not enter remediation tickets, but must not be silently discarded.
