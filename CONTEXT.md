# MarkText

MarkText is a Markdown editing context that presents Markdown source through a realtime, rendered editing surface while preserving the document as Markdown.

## Language

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
