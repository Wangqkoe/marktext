# MarkText

MarkText is a Markdown editing context that presents Markdown source through a realtime, rendered editing surface while preserving the document as Markdown.

## Language

**Document**:
A Markdown document with one shared content, unsaved-change state, edit history, save lifecycle and file identity, regardless of how many views display it.
_Avoid_: Tab, view (when referring to the document itself)

**View**:
A tab's presentation of a document, with its own scroll position, cursor and editing mode; multiple views can display the same document.
_Avoid_: Document copy, independent file

**Scroll Performance Contract**:
The shared measurement and acceptance vocabulary for every scroll surface, covering benchmark fixtures, input modes and thresholds without requiring a common runtime scrolling engine; each surface retains its native or surface-specific semantics and implementation. Confirmed performance problems are separated by root cause into WYSIWYG scrolling pressure from global projection/TOC updates, Source large-document capacity and Opened Files scale pressure.
_Avoid_: Shared scroll engine, universal scroll implementation

**Live Scroll Position**:
The current scroll offset presented by a View while scrolling, before it becomes the Committed Scroll Position.
_Avoid_: Saved scroll position, persisted scroll position

**Committed Scroll Position**:
The latest scroll position recorded for a View to maintain continuity within the current application session; it does not imply restoration across application restarts.
_Avoid_: Persistent scroll position, restart-restored position

**Move to Left or Right**:
A relocation of a tab's view to the corresponding pane, not a second view of the document.
_Avoid_: Split Left, Split Right (for relocation)

**Split Right**:
A second view of the same document in the right pane, with the original left view retained.
_Avoid_: Move to Right, copy document

**Folder root**:
The root directory attached to the current editing window and presented in Files.
_Avoid_: Project

**Opened files region**:
The region in Files that lists the document views currently open in the editing window.
_Avoid_: Opened Files pane, tabs (when referring to the region)

**Folder tree region**:
The region in Files that presents the Folder root hierarchy, or the Open Folder entry point when no Folder root is attached.
_Avoid_: Project tree, folder pane

**Sidebar divider**:
The draggable boundary in Files that allocates vertical space between the Opened files region and Folder tree region.
_Avoid_: Fixed separator, pane splitter

**LaTeX math delimiters**:
An optional Markdown extension comprising the inline math delimiter and display math delimiter forms.
_Avoid_: LaTeX brackets, bracket math

**Inline math delimiter**:
The `\(...\)` form, denoting a mathematical expression within a paragraph.
_Avoid_: Parenthesis formula

**Display math delimiter**:
The `\[...\]` form, denoting a mathematical expression presented as display math, whether its delimiters occur on one line or separate lines.
_Avoid_: Square-bracket formula, block bracket

**Window Zoom**:
The Electron window scale applied to the whole application, including the shell, editing content and controls.
_Avoid_: Document Zoom, editor font size

**Document Zoom**:
The persisted scale applied only to document editing content, shared by all Views and panes in a window and excluded from export and print output.
_Avoid_: Window Zoom, editor font size
