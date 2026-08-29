# T07 physical drag-out evidence — 2026-08-29

## Scope and disposition

T07/A09 is `Passed` for the supported Windows shape: one primary display,
single-DPI, physical outside-up, tab-bar inside-up/reorder, re-entry inside-up,
and Escape cancellation. This is an independent T07 physical gate; it does not
re-prove or change STAB-006's close→Move defect record.

Remote/assistive, multi-display, and mixed-DPI shapes were not verified and
remain `Unavailable`/untested under the V1 fallback rule: external drag is
disabled and the Move menu remains usable. Blur/timeout are covered by the
automatic contract, not claimed as physical manual actions. This evidence does
not close the complete same-artifact manual matrix, T12, final Review, or final
Acceptance.

## Artifact and environment

Artifact: `C:\Users\1407\.codex\worktrees\cee8\Marktext\dist\stab006-formal-complete-800a9920\win-unpacked`;
129 files / 476,315,948 bytes. SHA-256: `marktext.exe`
`F7C3E3EBF82995C7D71E544F5F1FAF7E41C86219A38D50F52B7768869B7B03B5`;
`resources\app.asar`
`4C3A601D8AF20D1AE8C7DFEE2A87314AED3427897EF0182B590D3F0173E7E81E`;
`icudtl.dat`
`C5DA2FC389D1BB0ECB13FE22A8E069B7ABC491F8AA5D16EB65D4FF32C85A46B6`.

Windows 11 Professional `10.0.26200`, 64-bit; one screen `DISPLAY1`, primary,
2560×1440, working area 2560×1392; System DPI 96 / scale 100%; Electron
42.1.0. Profile:
`C:\Users\1407\AppData\Local\Temp\marktext-physical-drag-formal-800a9920\manual-01\profile`.
Fixture:
`C:\Users\1407\AppData\Local\Temp\marktext-physical-drag-formal-800a9920\manual-01\drag-out-final.md`,
63 bytes, SHA-256
`FA838A6E7151DF3D5508708B03171D55E536D82F35AC94B485F80FD9B7FBBA27`.

Exact launch command:

```powershell
Start-Process -FilePath 'C:\Users\1407\.codex\worktrees\cee8\Marktext\dist\stab006-formal-complete-800a9920\win-unpacked\marktext.exe' -WorkingDirectory 'C:\Users\1407\.codex\worktrees\cee8\Marktext\dist\stab006-formal-complete-800a9920\win-unpacked' -ArgumentList '--user-data-dir=C:\Users\1407\AppData\Local\Temp\marktext-physical-drag-formal-800a9920\manual-01\profile', 'C:\Users\1407\AppData\Local\Temp\marktext-physical-drag-formal-800a9920\manual-01\drag-out-final.md' -PassThru
```

## Results

The first core test was captured at `2026-08-29 10:22:12 PDT`; the final
Escape-cancellation capture was `2026-08-29 10:27:43 PDT`. The user performed
all four supported physical cases:

- File > New Tab, then drag the file tab within the tab bar and release on the
  other side: tab reordered, with no Split preview or pane.
- Drag the file tab outside the native window and release: a target window was
  created containing the file; the source retained only New Tab; no Split.
- Drag outside, return to the tab bar, and release: no new window or Split; the
  file remained in the original window.
- Drag outside, hold the left button, press Escape, then release outside: no
  new window or Split; the file remained in the original window.

Main PID `58260` was Responding. Final reliable enumeration found one visible
window, `drag-out-final.md`, and five exact artifact/profile processes. The
profile `main.log` had 5 lines and 0 error / 0 crash entries; Crashpad had 2
metadata files and 0 dumps.

Existing automatic evidence covers both injected flag cases, inside-up,
re-entry, Escape, crossing/blur/timeout, stale epoch, and unsupported
capability. T06/Move covered 5 files / 50 passed; build/package smoke passed;
their detailed commands remain in the existing ticket and acceptance records.

The product has no user action that independently triggers a timeout commit;
blur/timeout are not commit events. They therefore use the deterministic adapter
contract and cannot be substituted by waiting or losing focus for the outside
left-up physical evidence. The first review found the old ticket's manual-versus-
automatic responsibility wording conflicted with this record; the ticket was
revised to make the test responsibilities explicit. Remote/assistive,
multi-display, mixed-DPI, and the complete manual/T12/Acceptance gates remain
unclaimed.
