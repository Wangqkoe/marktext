# Define the remediation handoff

Type: `grilling`
Status: `ready-for-agent`
Blocked by: 03

## Question

How should confirmed findings be grouped into a specification and implementation tickets, and which regression, review, acceptance and local-commit gates must each fix satisfy?

## Comments

- Prefer one independently reviewable defect per implementation ticket unless multiple symptoms share one proven root cause.
- Require regression coverage before a fix when the real failure seam is testable.
- Record unavailable platform checks rather than treating them as passing.
- Keep commits local and do not push to GitHub.
