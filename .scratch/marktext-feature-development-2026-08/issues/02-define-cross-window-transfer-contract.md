# 定义标签页跨窗口传输与窗口生命周期契约

Type: `grilling`
Status: `resolved`
Claimed by: coordination task
Blocked by: 01

## Question

What transactional contract governs tab transfer and new-window creation: snapshot/ACK sequence, failure rollback, source-last-tab behavior, target placement/focus/session restoration, dual-window save-conflict protection, and context-menu enablement and wording?

## Comments

- Resolve the product and lifecycle contract before choosing IPC payload fields or implementation seams.

## Answer

`Move to new window` is a lossless ownership transfer. Its serializable snapshot covers Markdown/content, saved path or untitled identity, dirty/save state, cursor and selection, scroll position, WYSIWYG/source mode, and undo/redo history. IME composition, active drags, and other transient DOM state must first end safely and are not transferred.

The target must acknowledge successful ownership before the source removes the tab. On target failure or timeout, the source tab and all of its state remain completely intact. If the moved tab was the source window's last tab, the source window remains open and receives a standard clean untitled blank page; after a successful transfer, the target window receives focus.

For drag detach, create the target near the release pointer and clamp it to the active display work area. For context-menu actions, use existing new-window dimensions and an offset from the source window. The precise geometry, multi-display details, and gesture fallback are prototype evidence questions.

`Open in new window` is enabled only for a saved path; an untitled tab is disabled. When its source is dirty, first explain that the target opens the last saved disk version while the source retains its unsaved edits. The two windows may edit independently. After one saves, a clean peer automatically reloads; a dirty peer becomes stale/conflicted and ordinary save is blocked until the user reloads/discards, uses Save As, or explicitly confirms a disk overwrite in a second confirmation. No silent last-save-wins behavior is permitted.

The context-menu operation group is ordered `Move to new window`, `Open in new window`, then `Split`, and is separated from existing tab actions by a divider. Move supports saved, dirty, and untitled tabs.

Session restore preserves the window structure formed by Move and Open plus each window's independent view state. Move-created dirty or untitled state restores only in its target window; dual opens restore independently and retain the same conflict guard. Failure restoring one window must not damage another window's restore data.
