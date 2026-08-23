# 定义标签页跨窗口传输与窗口生命周期契约

Type: `grilling`
Status: `in-progress`
Claimed by: coordination task
Blocked by: 01

## Question

What transactional contract governs tab transfer and new-window creation: snapshot/ACK sequence, failure rollback, source-last-tab behavior, target placement/focus/session restoration, dual-window save-conflict protection, and context-menu enablement and wording?

## Comments

- Resolve the product and lifecycle contract before choosing IPC payload fields or implementation seams.
