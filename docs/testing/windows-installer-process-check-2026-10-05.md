# Windows installer process-check acceptance (2026-10-05)

## Scope

This acceptance run covers the Windows NSIS process guard introduced in source commit `1043219574e343f3ee828ebbecb1cd7f0012b3bf`. It verifies the native `nsProcess` path, fail-closed behavior, legacy-uninstaller environment compatibility, and the electron-builder include order that defines `APP_EXECUTABLE_FILENAME` after the project include.

The reusable harness is `scripts/test-windows-installer-process-check.ps1`. It uses the existing electron-builder 26.15.3 NSIS templates, cached NSIS 3.0.4.1 compiler, and cached x86-unicode plug-ins. It installs no packages and does not depend on a worktree `node_modules` directory.

## Command and result

From the repository root:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-windows-installer-process-check.ps1
```

The command exited `0` and printed:

```text
PASS evidence=E:\Program Files\Marktext-performance-evidence\2026-10-05-windows-installer-process-check
```

The evidence directory contains numbered compiler logs and runtime results. The final `26-summary.txt` and `27-cleanup.txt` report `result=PASS`, 14 owned processes, and zero remaining owned processes. Earlier-numbered summary files in that directory are retained records from harness development; the run ID and UTC time in `10-environment.txt` identify the final run.

## Verified behavior

- The installer-mode harness compiled with the project `installer.nsh` included before `APP_EXECUTABLE_FILENAME`, followed by `allowOnlyOneInstallerInstance.nsh` and `customHeader`. Runtime checks entered through the real `CHECK_APP_RUNNING` dispatcher. The native absent-process check returned `0` and preserved `$R0` and `$R1` sentinels.
- A uniquely named NSIS sleep fixture was launched hidden and recorded by PID, UTC start time, and its requested absolute executable path. The native guard returned `2` while the fixture was running and left that process alive. After the harness stopped only its owned PID, the same guard returned `0`.
- A compile-time `nsProcess` stub returning error `609` made the silent guard return `2` without creating its success result. This confirms unknown plug-in errors fail closed.
- `BUILD_UNINSTALLER` was defined before the early project include, matching the builder's preprocessor timing. The compile log defines and calls `un.MarkTextCheckAppRunning` from an uninstall section, with no unreferenced ordinary installer function. The harness did not expand installer-only `customInstall` in an uninstall section.
- A deterministic LogicLib condition expanded the real `customInit` macro without UAC elevation. The ordinary outer-instance branch left an `OuterSentinel` environment value unchanged and unprepared; the simulated inner branch invoked the checker, changed the process-local value to `Restricted`, and then restored it.
- Environment preparation was called twice in each case. For an initially unset variable and explicit `AllSigned`, `RemoteSigned`, and `Bypass` values, the process-local `PSExecutionPolicyPreference` became `Restricted` and then returned exactly to its initial set/unset state. The functions preserved `$R0` and `$R1`, and reported no restore error.
- After preparation, the real legacy `IS_POWERSHELL_AVAILABLE` macro reported `1` (unavailable). Only then did the harness invoke the real legacy `FIND_PROCESS` macro: its tasklist fallback returned `0` for the owned fixture and `1` after the fixture closed. Each external process had a short owner-enforced deadline.
- A read-only check recorded the installed legacy uninstaller at `E:\Users\1407\AppData\Local\Programs\marktext\Uninstall marktext.exe`: 188,989 bytes, SHA-256 `3e42c2f2c6f71f1c3663fb7ed73411351aaa47488266bded98aadfadcf961d60`. Prior payload inspection found the legacy `Get-CimInstance -ClassName Win32_Process`, `Get-Command Get-CimInstance`, `Get-ExecutionPolicy -Scope Process`, and `tasklist /FI` strings. The acceptance run did not execute that binary.

The run did not execute a real MarkText installer or uninstaller, modify the registry or user profile, change persistent PowerShell policy, restart WMI, or globally stop processes. Temporary files were removed only after the resolved path was confirmed under the system temp directory with the harness-specific prefix. The worktree did not acquire a `node_modules` directory.

## Coverage limit

The interactive Retry button was not automated. Silent mode exercised its default Cancel path, and a close-then-rerun sequence verified that the same guard succeeds once the owned target exits. This avoids displaying unattended installer UI while still covering the native decision logic and retry precondition.
