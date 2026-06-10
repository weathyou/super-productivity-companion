Unicode true
Name "Super Productivity Companion"
OutFile "${OUT_FILE}"
RequestExecutionLevel user
InstallDir "$LOCALAPPDATA\Programs\Super Productivity Companion"
ShowInstDetails show
BrandingText "Super Productivity Companion ${PRODUCT_VERSION} ${ARCH}"

!include LogicLib.nsh

Section "Install"
  SetShellVarContext current
  SetOutPath "$TEMP\super-productivity-companion-${PRODUCT_VERSION}-${ARCH}"

  DetailPrint "Extracting Super Productivity installer..."
  File "/oname=SuperProductivitySetup.exe" "${SP_INSTALLER}"

  DetailPrint "Extracting Clawd on Desk installer..."
  File "/oname=ClawdOnDeskSetup.exe" "${CLAWD_INSTALLER}"

  DetailPrint "Installing Super Productivity..."
  ExecWait '"$OUTDIR\SuperProductivitySetup.exe" /S' $0
  ${If} $0 != 0
    MessageBox MB_ICONSTOP "Super Productivity installer failed with exit code $0."
    Abort
  ${EndIf}

  DetailPrint "Installing Clawd on Desk..."
  ExecWait '"$OUTDIR\ClawdOnDeskSetup.exe" /S' $0
  ${If} $0 != 0
    MessageBox MB_ICONSTOP "Clawd on Desk installer failed with exit code $0."
    Abort
  ${EndIf}

  DetailPrint "Launching installed apps..."
  IfFileExists "$LOCALAPPDATA\Programs\Super Productivity\Super Productivity.exe" 0 +2
    ExecShell "open" "$LOCALAPPDATA\Programs\Super Productivity\Super Productivity.exe"
  IfFileExists "$PROGRAMFILES64\Super Productivity\Super Productivity.exe" 0 +2
    ExecShell "open" "$PROGRAMFILES64\Super Productivity\Super Productivity.exe"
  IfFileExists "$PROGRAMFILES\Super Productivity\Super Productivity.exe" 0 +2
    ExecShell "open" "$PROGRAMFILES\Super Productivity\Super Productivity.exe"

  IfFileExists "$LOCALAPPDATA\Programs\Clawd on Desk\Clawd on Desk.exe" 0 +2
    ExecShell "open" "$LOCALAPPDATA\Programs\Clawd on Desk\Clawd on Desk.exe"
  IfFileExists "$PROGRAMFILES64\Clawd on Desk\Clawd on Desk.exe" 0 +2
    ExecShell "open" "$PROGRAMFILES64\Clawd on Desk\Clawd on Desk.exe"
  IfFileExists "$PROGRAMFILES\Clawd on Desk\Clawd on Desk.exe" 0 +2
    ExecShell "open" "$PROGRAMFILES\Clawd on Desk\Clawd on Desk.exe"

  RMDir /r "$OUTDIR"
SectionEnd
