[CmdletBinding()]
param(
  [string] $EvidenceRoot = 'E:\Program Files\Marktext-performance-evidence\2026-10-05-windows-installer-process-check'
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$PSNativeCommandUseErrorActionPreference = $false

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$installerInclude = Join-Path $repoRoot 'packages\desktop\build\windows\installer.nsh'
$builderRoot = 'E:\Program Files\Marktext\node_modules\.pnpm\app-builder-lib@26.15.3_dmg_c5739d9600ac3f98a55503c35c5a46a9\node_modules\app-builder-lib\templates\nsis'
$builderInclude = Join-Path $builderRoot 'include'
$allowOnlyOne = Join-Path $builderInclude 'allowOnlyOneInstallerInstance.nsh'
$makensis = 'C:\Users\1407\AppData\Local\electron-builder\Cache\nsis-3.0.4.1\nsis-3.0.4.1-1mx3n\Bin\makensis.exe'
$pluginDir = 'C:\Users\1407\AppData\Local\electron-builder\Cache\nsis-resources-3.4.1\nsis-resources-3.4.1-2jx2y\plugins\x86-unicode'

foreach ($required in @($installerInclude, $allowOnlyOne, $makensis, $pluginDir)) {
  if (-not (Test-Path -LiteralPath $required)) { throw "Required path is missing: $required" }
}

$evidenceParent = Split-Path -Parent $EvidenceRoot
New-Item -ItemType Directory -Force -Path $evidenceParent | Out-Null
New-Item -ItemType Directory -Force -Path $EvidenceRoot | Out-Null
$evidenceResolved = (Resolve-Path -LiteralPath $EvidenceRoot).Path
if ($evidenceResolved -ne [IO.Path]::GetFullPath($EvidenceRoot)) {
  throw "Evidence path resolved unexpectedly: $evidenceResolved"
}

$runId = [Guid]::NewGuid().ToString('N')
$scratch = Join-Path ([IO.Path]::GetTempPath()) "marktext-installer-check-$runId"
New-Item -ItemType Directory -Path $scratch | Out-Null
$ownedProcesses = [Collections.Generic.List[Diagnostics.Process]]::new()
$results = [Collections.Generic.List[string]]::new()

function Write-Utf8File([string] $Path, [string] $Value) {
  [IO.File]::WriteAllText($Path, $Value, [Text.UTF8Encoding]::new($false))
}

function Convert-NsisPath([string] $Path) { return $Path.Replace('\', '\\') }

function Invoke-MakeNsis([string] $Source, [string] $LogName) {
  $logPath = Join-Path $evidenceResolved $LogName
  $savedErrorAction = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    $output = & $makensis /V4 $Source 2>&1 | Out-String
    $exitCode = $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $savedErrorAction
  }
  Write-Utf8File $logPath $output
  if ($exitCode -ne 0) { throw "makensis failed ($exitCode); see $logPath" }
}

function Invoke-OwnedProcess([string] $FilePath, [string] $Arguments, [int] $DeadlineSeconds = 15) {
  $process = Start-Process -FilePath $FilePath -ArgumentList $Arguments -PassThru -WindowStyle Hidden
  $ownedProcesses.Add($process)
  $started = $process.StartTime.ToUniversalTime().ToString('o')
  $path = [IO.Path]::GetFullPath($FilePath)
  return [pscustomobject]@{ Process = $process; Pid = $process.Id; StartUtc = $started; Path = $path; DeadlineSeconds = $DeadlineSeconds }
}

function Wait-OwnedProcess($Owned) {
  if (-not $Owned.Process.WaitForExit($Owned.DeadlineSeconds * 1000)) {
    throw "Owned process $($Owned.Pid) exceeded $($Owned.DeadlineSeconds)s deadline: $($Owned.Path)"
  }
  return $Owned.Process.ExitCode
}

function Stop-OwnedProcess($Owned) {
  if ($Owned.Process.HasExited) { return }
  $live = Get-Process -Id $Owned.Pid -ErrorAction Stop
  if ($live.StartTime.ToUniversalTime().ToString('o') -ne $Owned.StartUtc) { throw "PID reuse detected for $($Owned.Pid)" }
  if ($live.Path -and -not $live.Path.Equals($Owned.Path, [StringComparison]::OrdinalIgnoreCase)) { throw "Owned process path changed for $($Owned.Pid)" }
  Stop-Process -Id $Owned.Pid
  if (-not $Owned.Process.WaitForExit(5000)) { throw "Owned process $($Owned.Pid) did not stop" }
}

function New-GuardSource([string] $Name, [string] $TargetName, [string] $ResultPath, [switch] $BuildUninstaller, [switch] $Fake609) {
  $source = Join-Path $scratch "$Name.nsi"
  $out = Join-Path $scratch "$Name.exe"
  $buildDefine = if ($BuildUninstaller) { '!define BUILD_UNINSTALLER' } else { '' }
  $sectionName = if ($BuildUninstaller) { "Section`r`nSectionEnd`r`nSection `"Uninstall`"" } else { 'Section' }
  $fake = if ($Fake609) {
@'
!define nsProcess::FindProcess `!insertmacro FakeFindProcess`
!macro FakeFindProcess _FILE _ERR
  StrCpy ${_ERR} 609
!macroend
!define nsProcess::Unload `!insertmacro FakeUnload`
!macro FakeUnload
!macroend
'@
  } else { '' }
  $text = @"
Unicode true
SetCompressor zlib
Name "$Name"
OutFile "$(Convert-NsisPath $out)"
SilentInstall silent
RequestExecutionLevel user
!addincludedir "$(Convert-NsisPath $builderInclude)"
!addplugindir "$(Convert-NsisPath $pluginDir)"
!include "LogicLib.nsh"
$fake
$buildDefine
!include "$(Convert-NsisPath $installerInclude)"
!define PRODUCT_NAME "MarkText Harness"
!define APP_EXECUTABLE_FILENAME "$TargetName"
!include "$(Convert-NsisPath $allowOnlyOne)"
!insertmacro customHeader
$sectionName
  StrCpy `$R0 "register-r0-sentinel"
  StrCpy `$R1 "register-r1-sentinel"
  !insertmacro CHECK_APP_RUNNING
  StrCmp `$R0 "register-r0-sentinel" 0 register_failed
  StrCmp `$R1 "register-r1-sentinel" 0 register_failed
  FileOpen `$0 "$(Convert-NsisPath $ResultPath)" w
  FileWrite `$0 "guard-returned;R0=`$R0;R1=`$R1`$\r`$\n"
  FileClose `$0
  SetErrorLevel 0
  Quit
register_failed:
  SetErrorLevel 9
  Quit
SectionEnd
"@
  Write-Utf8File $source $text
  return [pscustomobject]@{ Source = $source; Exe = $out }
}

try {
  $head = (git -C $repoRoot rev-parse HEAD).Trim()
  $status = git -C $repoRoot status --short
  Write-Utf8File (Join-Path $evidenceResolved '10-environment.txt') (@"
run_id=$runId
utc=$([DateTime]::UtcNow.ToString('o'))
repo=$repoRoot
head=$head
status=$($status -join ';')
makensis=$makensis
builder_root=$builderRoot
plugin_dir=$pluginDir
scratch=$scratch
"@)

  # A unique NSIS executable gives the native process plug-in a target that this
  # script owns and can identify by PID, creation time, and absolute path.
  $targetName = "mtguard-$($runId.Substring(0, 12)).exe"
  $fixtureSource = Join-Path $scratch 'owned-fixture.nsi'
  $fixtureExe = Join-Path $scratch $targetName
  Write-Utf8File $fixtureSource @"
Unicode true
SetCompressor zlib
Name "Owned process fixture"
OutFile "$(Convert-NsisPath $fixtureExe)"
SilentInstall silent
RequestExecutionLevel user
Section
  Sleep 60000
SectionEnd
"@
  Invoke-MakeNsis $fixtureSource '11-compile-owned-fixture.log'

  $nativeResult = Join-Path $scratch 'native-result.txt'
  $native = New-GuardSource 'native-guard' $targetName $nativeResult
  Invoke-MakeNsis $native.Source '12-compile-installer-guard.log'

  $absentRun = Invoke-OwnedProcess $native.Exe '/S'
  $absentExit = Wait-OwnedProcess $absentRun
  if ($absentExit -ne 0 -or -not (Test-Path $nativeResult)) { throw "Native absent check failed: exit=$absentExit" }
  Write-Utf8File (Join-Path $evidenceResolved '13-native-absent.txt') "exit=$absentExit`r`n$(Get-Content -Raw $nativeResult)"
  Remove-Item -LiteralPath $nativeResult

  $fixture = Invoke-OwnedProcess $fixtureExe '/S' 70
  Start-Sleep -Milliseconds 400
  $foundRun = Invoke-OwnedProcess $native.Exe '/S'
  $foundExit = Wait-OwnedProcess $foundRun
  if ($foundExit -eq 0) { throw 'Native found check unexpectedly succeeded' }
  if ($fixture.Process.HasExited) { throw 'Guard terminated the owned target process' }
  Write-Utf8File (Join-Path $evidenceResolved '14-native-found-no-kill.txt') (@"
guard_exit=$foundExit
fixture_pid=$($fixture.Pid)
fixture_start_utc=$($fixture.StartUtc)
fixture_path=$($fixture.Path)
fixture_alive_after_guard=$(-not $fixture.Process.HasExited)
"@)
  Stop-OwnedProcess $fixture
  $retryRun = Invoke-OwnedProcess $native.Exe '/S'
  $retryExit = Wait-OwnedProcess $retryRun
  if ($retryExit -ne 0 -or -not (Test-Path $nativeResult)) { throw "Native retry-after-close failed: exit=$retryExit" }
  Write-Utf8File (Join-Path $evidenceResolved '15-native-retry-after-close.txt') "exit=$retryExit`r`n$(Get-Content -Raw $nativeResult)"

  $fakeResult = Join-Path $scratch 'fake-result.txt'
  $fake = New-GuardSource 'fake-609-guard' $targetName $fakeResult -Fake609
  Invoke-MakeNsis $fake.Source '16-compile-fake-609.log'
  $fakeRun = Invoke-OwnedProcess $fake.Exe '/S'
  $fakeExit = Wait-OwnedProcess $fakeRun
  if ($fakeExit -eq 0 -or (Test-Path $fakeResult)) { throw "Fake plug-in error was not fail-closed: exit=$fakeExit" }
  Write-Utf8File (Join-Path $evidenceResolved '17-fake-609-fail-closed.txt') "simulated_nsProcess_code=609`r`nexit=$fakeExit`r`nresult_file_created=false`r`n"

  # Compile the same delayed function definitions in NSIS uninstall namespace.
  $uninstallResult = Join-Path $scratch 'uninstall-result.txt'
  $uninstall = New-GuardSource 'uninstaller-guard' $targetName $uninstallResult -BuildUninstaller
  Invoke-MakeNsis $uninstall.Source '18-compile-uninstaller-guard.log'

  # Expand the production customInit macro against a deterministic LogicLib
  # condition so both outer and inner UAC branches run without real elevation.
  $uacEvidence = [Collections.Generic.List[string]]::new()
  foreach ($innerValue in @(0, 1)) {
    $uacSource = Join-Path $scratch "uac-inner-$innerValue.nsi"
    $uacExe = Join-Path $scratch "uac-inner-$innerValue.exe"
    $uacResult = Join-Path $scratch "uac-inner-$innerValue.txt"
    $uacConditionDefine = '!define UAC_IsInnerInstance `"" HarnessInner ""`'
    $uacConditionCompare = '  StrCmp $HarnessInner 1 `${_t}` `${_f}`'
    Write-Utf8File $uacSource @"
Unicode true
SetCompressor zlib
Name "UAC branch harness"
OutFile "$(Convert-NsisPath $uacExe)"
SilentInstall silent
RequestExecutionLevel user
!addincludedir "$(Convert-NsisPath $builderInclude)"
!addplugindir "$(Convert-NsisPath $pluginDir)"
!include "LogicLib.nsh"
!include "$(Convert-NsisPath $installerInclude)"
!define PRODUCT_NAME "MarkText Harness"
!define APP_EXECUTABLE_FILENAME "$targetName"
!include "$(Convert-NsisPath $allowOnlyOne)"
$uacConditionDefine
!macro _HarnessInner _a _b _t _f
$uacConditionCompare
!macroend
Var HarnessInner
!insertmacro customHeader
Section
  StrCpy `$HarnessInner $innerValue
  System::Call 'kernel32::SetEnvironmentVariable(t "PSExecutionPolicyPreference", t "OuterSentinel") i.R0'
  !insertmacro customInit
  System::Call 'kernel32::GetEnvironmentVariable(t "PSExecutionPolicyPreference", t .R2, i `${NSIS_MAX_STRLEN}) i.R3'
  FileOpen `$0 "$(Convert-NsisPath $uacResult)" w
  FileWrite `$0 "inner=$innerValue;policy=`$R2;prepared=`$MarkTextLegacyPolicyPrepared`$\r`$\n"
  FileClose `$0
  Call MarkTextRestoreLegacyUninstallerEnvironment
SectionEnd
"@
    Invoke-MakeNsis $uacSource "19-compile-uac-inner-$innerValue.log"
    $uacRun = Invoke-OwnedProcess $uacExe '/S'
    $uacExit = Wait-OwnedProcess $uacRun
    $uacBody = Get-Content -Raw $uacResult
    if ($uacExit -ne 0) { throw "UAC branch $innerValue exited $uacExit" }
    if ($innerValue -eq 0 -and $uacBody -notmatch 'policy=OuterSentinel;prepared=') { throw "Outer UAC branch prepared environment: $uacBody" }
    if ($innerValue -eq 1 -and $uacBody -notmatch 'policy=Restricted;prepared=1') { throw "Inner UAC branch did not prepare environment: $uacBody" }
    $uacEvidence.Add("exit=$uacExit;$($uacBody.Trim())")
  }
  Write-Utf8File (Join-Path $evidenceResolved '20-uac-branch-simulation.txt') ($uacEvidence -join "`r`n")

  # Exercise environment capture, idempotent prepare, exact restore, and register preservation.
  $policySource = Join-Path $scratch 'policy-harness.nsi'
  $policyExe = Join-Path $scratch 'policy-harness.exe'
  $policyResult = Join-Path $scratch 'policy-result.txt'
  Write-Utf8File $policySource @"
Unicode true
SetCompressor zlib
Name "Policy harness"
OutFile "$(Convert-NsisPath $policyExe)"
SilentInstall silent
RequestExecutionLevel user
!addincludedir "$(Convert-NsisPath $builderInclude)"
!addplugindir "$(Convert-NsisPath $pluginDir)"
!include "LogicLib.nsh"
!include "$(Convert-NsisPath $installerInclude)"
!define PRODUCT_NAME "MarkText Harness"
!define APP_EXECUTABLE_FILENAME "$targetName"
!include "$(Convert-NsisPath $allowOnlyOne)"
!insertmacro customHeader
Var /GLOBAL CmdPath
Var /GLOBAL PowerShellPath
Section
  StrCpy `$R0 "register-r0-sentinel"
  StrCpy `$R1 "register-r1-sentinel"
  Call MarkTextPrepareLegacyUninstallerEnvironment
  Call MarkTextPrepareLegacyUninstallerEnvironment
  System::Call 'kernel32::GetEnvironmentVariable(t "PSExecutionPolicyPreference", t .R2, i `${NSIS_MAX_STRLEN}) i.R3'
  FileOpen `$0 "$(Convert-NsisPath $policyResult)" w
  FileWrite `$0 "prepared=`$R2;prepared_len=`$R3;was_set=`$MarkTextLegacyPolicyWasSet;original=`$MarkTextLegacyPolicyValue;R0=`$R0;R1=`$R1`$\r`$\n"
  Call MarkTextRestoreLegacyUninstallerEnvironment
  System::Call 'kernel32::GetEnvironmentVariable(t "PSExecutionPolicyPreference", t .R2, i `${NSIS_MAX_STRLEN}) i.R3'
  FileWrite `$0 "restored=`$R2;restored_len=`$R3;R0=`$R0;R1=`$R1;error=`$MarkTextLegacyPolicyError`$\r`$\n"
  FileClose `$0
SectionEnd
"@
  Invoke-MakeNsis $policySource '21-compile-policy-harness.log'
  $policyEvidence = [Collections.Generic.List[string]]::new()
  $savedPolicy = [Environment]::GetEnvironmentVariable('PSExecutionPolicyPreference', 'Process')
  try {
    foreach ($case in @([pscustomobject]@{ Name = 'unset'; Value = $null }, [pscustomobject]@{ Name = 'AllSigned'; Value = 'AllSigned' }, [pscustomobject]@{ Name = 'RemoteSigned'; Value = 'RemoteSigned' }, [pscustomobject]@{ Name = 'Bypass'; Value = 'Bypass' })) {
      [Environment]::SetEnvironmentVariable('PSExecutionPolicyPreference', $case.Value, 'Process')
      if (Test-Path $policyResult) { Remove-Item -LiteralPath $policyResult }
      $run = Invoke-OwnedProcess $policyExe '/S'
      $exit = Wait-OwnedProcess $run
      $body = Get-Content -Raw $policyResult
      if ($exit -ne 0 -or $body -notmatch 'prepared=Restricted' -or $body -notmatch 'R0=register-r0-sentinel;R1=register-r1-sentinel') { throw "Policy case $($case.Name) failed: $body" }
      if ($case.Name -eq 'unset') {
        if ($body -notmatch 'restored=;restored_len=0') { throw "Unset policy was not restored: $body" }
      } elseif ($body -notmatch "restored=$([regex]::Escape($case.Value));") { throw "Policy $($case.Name) was not restored: $body" }
      $policyEvidence.Add("[$($case.Name)] exit=$exit`r`n$body")
    }
  } finally {
    [Environment]::SetEnvironmentVariable('PSExecutionPolicyPreference', $savedPolicy, 'Process')
  }
  Write-Utf8File (Join-Path $evidenceResolved '22-policy-roundtrip.txt') ($policyEvidence -join "`r`n")

  # Invoke the real legacy macros only after prepare made PowerShell unavailable.
  $legacySource = Join-Path $scratch 'legacy-fallback.nsi'
  $legacyExe = Join-Path $scratch 'legacy-fallback.exe'
  $legacyResult = Join-Path $scratch 'legacy-result.txt'
  Write-Utf8File $legacySource @"
Unicode true
SetCompressor zlib
Name "Legacy fallback harness"
OutFile "$(Convert-NsisPath $legacyExe)"
SilentInstall silent
RequestExecutionLevel user
!addincludedir "$(Convert-NsisPath $builderInclude)"
!addplugindir "$(Convert-NsisPath $pluginDir)"
!include "LogicLib.nsh"
!include "$(Convert-NsisPath $installerInclude)"
!define PRODUCT_NAME "MarkText Harness"
!define APP_EXECUTABLE_FILENAME "$targetName"
!include "$(Convert-NsisPath $allowOnlyOne)"
!insertmacro customHeader
Var /GLOBAL CmdPath
Var /GLOBAL PowerShellPath
Section
  StrCpy `$CmdPath "`$SYSDIR\cmd.exe"
  StrCpy `$PowerShellPath "`$SYSDIR\WindowsPowerShell\v1.0\powershell.exe"
  Call MarkTextPrepareLegacyUninstallerEnvironment
  !insertmacro IS_POWERSHELL_AVAILABLE
  StrCmp `$IsPowerShellAvailable 1 fallback_confirmed
  SetErrorLevel 8
  Quit
fallback_confirmed:
  !insertmacro FIND_PROCESS "$targetName" `$R4
  FileOpen `$0 "$(Convert-NsisPath $legacyResult)" w
  FileWrite `$0 "is_powershell_available=`$IsPowerShellAvailable;find_result=`$R4`$\r`$\n"
  FileClose `$0
  Call MarkTextRestoreLegacyUninstallerEnvironment
SectionEnd
"@
  Invoke-MakeNsis $legacySource '23-compile-legacy-fallback.log'
  $fixture2 = Invoke-OwnedProcess $fixtureExe '/S' 70
  Start-Sleep -Milliseconds 400
  $legacyFoundRun = Invoke-OwnedProcess $legacyExe '/S' 20
  $legacyFoundExit = Wait-OwnedProcess $legacyFoundRun
  $legacyFoundBody = Get-Content -Raw $legacyResult
  if ($legacyFoundExit -ne 0 -or $legacyFoundBody -notmatch 'is_powershell_available=1;find_result=0') { throw "Legacy fallback found failed: $legacyFoundBody" }
  Stop-OwnedProcess $fixture2
  Remove-Item -LiteralPath $legacyResult
  $legacyAbsentRun = Invoke-OwnedProcess $legacyExe '/S' 20
  $legacyAbsentExit = Wait-OwnedProcess $legacyAbsentRun
  $legacyAbsentBody = Get-Content -Raw $legacyResult
  if ($legacyAbsentExit -ne 0 -or $legacyAbsentBody -notmatch 'is_powershell_available=1' -or $legacyAbsentBody -match 'find_result=0') { throw "Legacy fallback absent failed: $legacyAbsentBody" }
  Write-Utf8File (Join-Path $evidenceResolved '24-legacy-real-macros.txt') "[found] exit=$legacyFoundExit`r`n$legacyFoundBody`r`n[absent] exit=$legacyAbsentExit`r`n$legacyAbsentBody"

  $oldUninstaller = 'E:\Users\1407\AppData\Local\Programs\marktext\Uninstall marktext.exe'
  $oldHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $oldUninstaller).Hash.ToLowerInvariant()
  Write-Utf8File (Join-Path $evidenceResolved '25-installed-uninstaller-readonly.txt') "path=$oldUninstaller`r`nbytes=$((Get-Item -LiteralPath $oldUninstaller).Length)`r`nsha256=$oldHash`r`nexecuted=false`r`n"

  Write-Utf8File (Join-Path $evidenceResolved '26-summary.txt') (@"
result=PASS
native_absent_exit=$absentExit
native_found_exit=$foundExit
native_retry_exit=$retryExit
fake_609_exit=$fakeExit
uninstaller_mode_compile=PASS
uac_outer_policy_unchanged=PASS
uac_inner_policy_prepared=PASS
policy_cases=unset,AllSigned,RemoteSigned,Bypass
legacy_real_macro_found_exit=$legacyFoundExit
legacy_real_macro_absent_exit=$legacyAbsentExit
interactive_retry_gui=NOT_EXECUTED (silent /SD cancel and close-then-rerun paths covered)
real_installer_or_uninstaller_executed=false
"@)
  Write-Output "PASS evidence=$evidenceResolved"
} finally {
  foreach ($process in $ownedProcesses) {
    if (-not $process.HasExited) {
      try {
        $live = Get-Process -Id $process.Id -ErrorAction Stop
        if ($live.Path -and $live.Path.StartsWith($scratch, [StringComparison]::OrdinalIgnoreCase)) {
          Stop-Process -Id $process.Id
          $null = $process.WaitForExit(5000)
        }
      } catch { }
    }
  }
  $remaining = @($ownedProcesses | Where-Object { -not $_.HasExited })
  Write-Utf8File (Join-Path $evidenceResolved '27-cleanup.txt') "owned_processes=$($ownedProcesses.Count)`r`nremaining_owned_processes=$($remaining.Count)`r`nscratch=$scratch`r`n"
  $scratchResolved = (Resolve-Path -LiteralPath $scratch -ErrorAction SilentlyContinue).Path
  $tempResolved = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
  if ($scratchResolved -and $scratchResolved.StartsWith($tempResolved, [StringComparison]::OrdinalIgnoreCase) -and (Split-Path -Leaf $scratchResolved).StartsWith('marktext-installer-check-')) {
    Remove-Item -LiteralPath $scratchResolved -Recurse -Force
  }
}
