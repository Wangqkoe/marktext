; installer.nsh — include via electron-builder's nsis.include

!ifndef MARKTEXT_INSTALLER_NSH_INCLUDED
!define MARKTEXT_INSTALLER_NSH_INCLUDED

; Windows remembers an "Open with" choice as a UserChoice naming this ProgId,
; and that pin outlives any reinstall, so the name must stay as it is.
!define MT_PROGID "MarkText.Document"

;======================================================================
; Markdown file associations.
;
; These must be written on every install and removed only on a real uninstall.
; electron-builder runs the previous version's uninstaller silently before it
; installs, so unregistering there unconditionally while registering only
; behind a prompt left any update or reinstall answered "No" with a UserChoice
; pointing at a ProgId that no longer existed, and Explorer's double-click did
; nothing at all (#4966).

; The "Open with" dialog builds its UserChoice from OpenWithProgids, so
; without that entry Windows pins the ProgId electron-builder registers from
; `fileAssociations` rather than this one.
!macro mtAssociateExtension EXT
  WriteRegStr SHELL_CONTEXT "Software\Classes\${EXT}" "" "${MT_PROGID}"
  WriteRegNone SHELL_CONTEXT "Software\Classes\${EXT}\OpenWithProgids" "${MT_PROGID}"
!macroend

; The extension key also carries the OpenWithProgids entries of every other
; Markdown editor the user has installed, so only MarkText's own values go.
!macro mtUnassociateExtension EXT
  DeleteRegValue SHELL_CONTEXT "Software\Classes\${EXT}\OpenWithProgids" "${MT_PROGID}"
  Push $0
  ReadRegStr $0 SHELL_CONTEXT "Software\Classes\${EXT}" ""
  ${if} $0 == "${MT_PROGID}"
    DeleteRegValue SHELL_CONTEXT "Software\Classes\${EXT}" ""
  ${endIf}
  Pop $0
!macroend

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

  !insertmacro mtAssociateExtension ".md"
  !insertmacro mtAssociateExtension ".markdown"
  !insertmacro mtAssociateExtension ".mmd"
  !insertmacro mtAssociateExtension ".mdown"
  !insertmacro mtAssociateExtension ".mdtxt"
  !insertmacro mtAssociateExtension ".mdtext"
  !insertmacro mtAssociateExtension ".mdx"

  WriteRegStr SHELL_CONTEXT "Software\Classes\${MT_PROGID}" \
    "" "MarkText Markdown Document"
  WriteRegExpandStr SHELL_CONTEXT "Software\Classes\${MT_PROGID}\DefaultIcon" \
    "" "$INSTDIR\resources\icons\md.ico,0"
  WriteRegExpandStr SHELL_CONTEXT "Software\Classes\${MT_PROGID}\shell\open\command" \
    "" '"$INSTDIR\marktext.exe" "%1"'

  ; electron-builder writes the command for its own ProgId — `Markdown`, the
  ; `fileAssociations[].name` in electron-builder.yml — with the executable
  ; path unquoted, which runs `C:\Program` when the directory the user picked
  ; during setup contains a space.
  WriteRegStr SHELL_CONTEXT "Software\Classes\Markdown\shell\open\command" \
    "" '"$INSTDIR\marktext.exe" "%1"'

  ; Explorer serves file types from a cache that a fresh install otherwise
  ; keeps until the next sign-in.
  System::Call 'shell32::SHChangeNotify(i, i, i, i) v (0x08000000, 0, 0, 0)'
!macroend

;======================================================================
; customUnInstall macro cleans up on uninstall
!macro customUnInstall
  ; An update reaches here through the old uninstaller, right before the new
  ; version registers the association again.
  ${ifNot} ${isUpdated}
    !insertmacro mtUnassociateExtension ".md"
    !insertmacro mtUnassociateExtension ".markdown"
    !insertmacro mtUnassociateExtension ".mmd"
    !insertmacro mtUnassociateExtension ".mdown"
    !insertmacro mtUnassociateExtension ".mdtxt"
    !insertmacro mtUnassociateExtension ".mdtext"
    !insertmacro mtUnassociateExtension ".mdx"
    DeleteRegKey SHELL_CONTEXT "Software\Classes\${MT_PROGID}"
  ${endIf}

  MessageBox MB_YESNO "Do you want to delete user settings?" /SD IDNO IDNO SkipRemoval
    SetShellVarContext current
    RMDir /r "$APPDATA\marktext"
  SkipRemoval:
!macroend

!endif
