# 定义分阶段实现交接与验收矩阵

Type: `task`
Status: `resolved`
Blocked by: none (02, 03, 04, 05, 06, 07, 09, 10, and 11 resolved)

## Question

Turn the confirmed contracts and prototype evidence into implementation-ready specifications and implementation tickets with dependency order, file and ownership boundaries, high-risk review gates for window/IPC/pane persistence/shared editor state, automated checks, manual platform scenarios, rollback constraints, and acceptance matrix.

## Comments

- This is the final map handoff. It creates the execution plan; it does not implement it.

## Answer

The final handoff is complete:

- [Unified V1 specification](../handoff/v1-spec.md) is the normative implementation
  contract and links each conclusion to its resolved owner Issue.
- [Acceptance matrix](../handoff/acceptance-matrix.md) defines evidence owners,
  environments, status rules, phase gates, and final Acceptance conditions.
- [T01–T12 implementation tickets](../handoff/tickets/) define the independent
  file ownership, dependency waves, risk/model, review gates and verification
  surfaces. The [implementation frontier](../handoff/implementation-frontier.md)
  records the recommended waves: T01; T02/T04/T09; T03/T05/T10; T06; T07/T08;
  T11; then T12.

Key risks remain implementation-time gates rather than open planning decisions:
session migration/shared editor isolation, DiskRevision CAS/watcher generations,
post-authorization WAL recovery and ownership uniqueness, endpoint epochs, and the
Windows-only external-release fallback. Prototypes remain evidence and must not be
copied into production.
