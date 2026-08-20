# Resolve exact visual geometry and interactions

Type: `prototype`
Status: `claimed`
Blocked by: 04, 07

## Question

Using the matched screenshots, which exact dimensions, spacing tokens, visual hierarchy, responsive breakpoints, and sidebar/title/tab/status interactions should the implementation specification require? Produce an annotated comparison or rough shell prototype so the user can approve the result at concrete visual fidelity.

## Comments

- The answer should distinguish exact acceptance values from deliberate deviations made to preserve MarkText capabilities.
- Claimed after Preferences was explicitly excluded. The prototype will compare three main-shell variants through a `?variant=` switcher and keep the ticket open for user feedback.
- Prototype primary source: local branch `codex/prototype-typora-shell`, commit `85726367`.
- Local worktree: `C:\Users\1407\AppData\Local\Temp\marktext-typora-shell-prototype`.
- Run `pnpm exec vite .scratch/typora-inspired-layout/prototype --host 127.0.0.1 --port 5173` from that worktree, then open `http://127.0.0.1:5173/?variant=A`.
- Visual QA confirmed all three URL variants render, the complete sidebar hides/restores, and the floating arrows update the shareable query parameter. Awaiting the user's choice or combination of A (Reference-aligned), B (Workspace column), and C (Compact focus).
