# 设计 TabTransfer IPC 与文件所有权契约

Type: `grilling`
Status: `open`
Blocked by: 02, 11

## Question

Define the serializable Document/View snapshot and the source renderer → main → target renderer two-phase transaction and ACK contract. Specify timeout, idempotency, and rollback behavior; file-watcher handoff; session-restore mapping; the stale/conflict guard; and a testable seam for this high-risk cross-process ownership boundary.

## Comments

- This is high-risk work. Resolve it with `codebase-design` and `domain-modeling`, then require an independent `gpt-5.6-terra` at `high` review before implementation handoff.
