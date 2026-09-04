# MarkText

MarkText is a Markdown editing context that presents Markdown source through a realtime, rendered editing surface while preserving the document as Markdown.

## Language

**Document**:
A Markdown document with one shared content, unsaved-change state, edit history, save lifecycle and file identity, regardless of how many views display it.
_Avoid_: Tab, view (when referring to the document itself)

**View**:
A tab's presentation of a document, with its own scroll position, cursor and editing mode; multiple views can display the same document.
_Avoid_: Document copy, independent file

**Move to Left or Right**:
A relocation of a tab's view to the corresponding pane, not a second view of the document.
_Avoid_: Split Left, Split Right (for relocation)

**Split Right**:
A second view of the same document in the right pane, with the original left view retained.
_Avoid_: Move to Right, copy document

**Folder root**:
The root directory attached to the current editing window and presented in Files.
_Avoid_: Project

**LaTeX math delimiters**:
An optional Markdown extension comprising the inline math delimiter and display math delimiter forms.
_Avoid_: LaTeX brackets, bracket math

**Inline math delimiter**:
The `\(...\)` form, denoting a mathematical expression within a paragraph.
_Avoid_: Parenthesis formula

**Display math delimiter**:
The `\[...\]` form, denoting a mathematical expression presented as display math, whether its delimiters occur on one line or separate lines.
_Avoid_: Square-bracket formula, block bracket
