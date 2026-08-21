# Define reproduction and triage rules

Type: `grilling`
Status: `ready-for-agent`
Blocked by: 01; 02

## Question

What minimum evidence confirms a finding as a product bug, and how should the audit distinguish deterministic defects, intermittent defects, expected behavior, environment failures, automation artifacts and unresolved product decisions?

## Comments

- Every confirmed bug needs a command or harness that can catch the reported symptom.
- Intermittent defects need a measured reproduction rate and a bounded stress loop.
- Screenshots and external capture output are supporting evidence, not sufficient proof when application state contradicts them.
