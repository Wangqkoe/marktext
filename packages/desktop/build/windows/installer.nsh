; installer.nsh — include via electron-builder’s nsis.include

!ifndef MARKTEXT_INSTALLER_NSH_INCLUDED
!define MARKTEXT_INSTALLER_NSH_INCLUDED

!ifndef nsProcess::FindProcess
  !include "nsProcess.nsh"
!endif

!ifdef BUILD_UNINSTALLER
  !define MARKTEXT_CHECK_APP_RUNNING_FUNCTION "un.MarkTextCheckAppRunning"
!else
  !define MARKTEXT_CHECK_APP_RUNNING_FUNCTION "MarkTextCheckAppRunning"
!endif

!macro customCheckAppRunning
  Call ${MARKTEXT_CHECK_APP_RUNNING_FUNCTION}
!macroend

!macro customHeader
!ifndef BUILD_UNINSTALLER
  Var MarkTextLegacyPolicyPrepared
  Var MarkTextLegacyPolicyWasSet
  Var MarkTextLegacyPolicyValue
  Var MarkTextLegacyPolicyError

  Function MarkTextPrepareLegacyUninstallerEnvironment
    Push $R0
    Push $R1

    StrCpy $MarkTextLegacyPolicyError 0
    ${If} $MarkTextLegacyPolicyPrepared != 1
      System::Call 'kernel32::GetEnvironmentVariable(t "PSExecutionPolicyPreference", t .R0, i ${NSIS_MAX_STRLEN}) i.R1'
      StrCpy $MarkTextLegacyPolicyValue $R0
      StrCpy $MarkTextLegacyPolicyWasSet 0
      ${If} $R1 != 0
        StrCpy $MarkTextLegacyPolicyWasSet 1
      ${EndIf}

      System::Call 'kernel32::SetEnvironmentVariable(t "PSExecutionPolicyPreference", t "Restricted") i.R0'
      ${If} $R0 == 0
        StrCpy $MarkTextLegacyPolicyError 1
      ${Else}
        StrCpy $MarkTextLegacyPolicyPrepared 1
      ${EndIf}
    ${EndIf}

    Pop $R1
    Pop $R0
  FunctionEnd

  Function MarkTextRestoreLegacyUninstallerEnvironment
    Push $R0

    StrCpy $MarkTextLegacyPolicyError 0
    ${If} $MarkTextLegacyPolicyPrepared == 1
      ${If} $MarkTextLegacyPolicyWasSet == 1
        System::Call 'kernel32::SetEnvironmentVariable(t "PSExecutionPolicyPreference", t "$MarkTextLegacyPolicyValue") i.R0'
      ${Else}
        System::Call 'kernel32::SetEnvironmentVariable(t "PSExecutionPolicyPreference", p 0) i.R0'
      ${EndIf}

      ${If} $R0 == 0
        StrCpy $MarkTextLegacyPolicyError 1
      ${Else}
        StrCpy $MarkTextLegacyPolicyPrepared 0
      ${EndIf}
    ${EndIf}

    Pop $R0
  FunctionEnd
!endif

Function ${MARKTEXT_CHECK_APP_RUNNING_FUNCTION}
  Push $R0

  MarkTextCheckAppRunningRetry:
    ${nsProcess::FindProcess} "${APP_EXECUTABLE_FILENAME}" $R0
    ${nsProcess::Unload}

    ${If} $R0 == 603
      !ifndef BUILD_UNINSTALLER
        Call MarkTextPrepareLegacyUninstallerEnvironment
        ${If} $MarkTextLegacyPolicyError != 0
          MessageBox MB_RETRYCANCEL|MB_ICONEXCLAMATION \
            "${PRODUCT_NAME} cannot safely prepare the previous version for removal. Close all ${PRODUCT_NAME} windows, then retry." \
            /SD IDCANCEL IDRETRY MarkTextCheckAppRunningRetry
          SetErrorLevel 2
          Pop $R0
          Quit
        ${EndIf}
      !endif

      Pop $R0
      Return
    ${EndIf}

    ${If} $R0 == 0
      MessageBox MB_RETRYCANCEL|MB_ICONEXCLAMATION \
        "${PRODUCT_NAME} is still running. Save your work and close all ${PRODUCT_NAME} windows before continuing." \
        /SD IDCANCEL IDRETRY MarkTextCheckAppRunningRetry
    ${Else}
      MessageBox MB_RETRYCANCEL|MB_ICONEXCLAMATION \
        "${PRODUCT_NAME} cannot safely determine whether it is running (process check error $R0). Close all ${PRODUCT_NAME} windows, then retry." \
        /SD IDCANCEL IDRETRY MarkTextCheckAppRunningRetry
    ${EndIf}

    SetErrorLevel 2
    Pop $R0
    Quit
FunctionEnd
!macroend

!ifndef BUILD_UNINSTALLER
  !macro customInit
    ${If} ${UAC_IsInnerInstance}
      Call MarkTextCheckAppRunning
    ${EndIf}
  !macroend
!endif

;======================================================================
; customInstall macro is invoked by electron-builder after files are in $INSTDIR
!macro customInstall
  Call MarkTextRestoreLegacyUninstallerEnvironment
  ${If} $MarkTextLegacyPolicyError != 0
    MessageBox MB_OK|MB_ICONSTOP \
      "${PRODUCT_NAME} could not restore the installer environment safely. Setup will stop without launching the application." /SD IDOK
    SetErrorLevel 2
    Quit
  ${EndIf}

  ; Ask the user if they want to register file associations
  MessageBox MB_YESNO|MB_ICONQUESTION \
  "Do you want to associate Markdown files (.md, .markdown, .mmd, .mdown, .mdtext, .mdx) with MarkText?" /SD IDNO IDNO SkipAssoc

  ;— User clicked YES, perform the registry writes —
  WriteRegStr HKCU "Software\Classes\.md"       "" "MarkText.Document"
  WriteRegStr HKCU "Software\Classes\.markdown" "" "MarkText.Document"
  WriteRegStr HKCU "Software\Classes\.mmd"      "" "MarkText.Document"
  WriteRegStr HKCU "Software\Classes\.mdown"    "" "MarkText.Document"
  WriteRegStr HKCU "Software\Classes\.mdtxt"    "" "MarkText.Document"
  WriteRegStr HKCU "Software\Classes\.mdtext"   "" "MarkText.Document"
  WriteRegStr HKCU "Software\Classes\.mdx"      "" "MarkText.Document"

  WriteRegStr HKCU "Software\Classes\MarkText.Document" \
    "" "MarkText Markdown Document"
  WriteRegExpandStr HKCU "Software\Classes\MarkText.Document\DefaultIcon" \
    "" "$INSTDIR\resources\icons\md.ico,0"
  WriteRegExpandStr HKCU "Software\Classes\MarkText.Document\shell\open\command" \
    "" '"$INSTDIR\marktext.exe" "%1"'

SkipAssoc:
!macroend

;======================================================================
; customUnInstall macro cleans up on uninstall
!macro customUnInstall
  ; Delete the open command subtree
  DeleteRegKey HKCU "Software\Classes\MarkText.Document\shell\open\command"
  DeleteRegKey HKCU "Software\Classes\MarkText.Document\shell\open"
  DeleteRegKey HKCU "Software\Classes\MarkText.Document\shell"

  ; Delete the DefaultIcon and ProgID
  DeleteRegKey HKCU "Software\Classes\MarkText.Document\DefaultIcon"
  DeleteRegKey HKCU "Software\Classes\MarkText.Document"

  ; Delete each extension mapping
  DeleteRegKey HKCU "Software\Classes\.md"
  DeleteRegKey HKCU "Software\Classes\.markdown"
  DeleteRegKey HKCU "Software\Classes\.mmd"
  DeleteRegKey HKCU "Software\Classes\.mdown"
  DeleteRegKey HKCU "Software\Classes\.mdtxt"
  DeleteRegKey HKCU "Software\Classes\.mdtext"
  DeleteRegKey HKCU "Software\Classes\.mdx"

  MessageBox MB_YESNO "Do you want to delete user settings?" /SD IDNO IDNO SkipRemoval
    SetShellVarContext current
    RMDir /r "$APPDATA\marktext"
  SkipRemoval:
!macroend

!endif
