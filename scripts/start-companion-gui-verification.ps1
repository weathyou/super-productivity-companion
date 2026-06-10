param(
  [string] $SessionRoot = "",
  [switch] $SkipElectronBuild
)

$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path -Parent $PSScriptRoot
$ClawdRoot = Join-Path $RepoRoot "clawd-on-desk"
$SuperProductivityRoot = Join-Path $RepoRoot "super-productivity"

if (-not $SessionRoot) {
  $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
  $SessionRoot = Join-Path ([System.IO.Path]::GetTempPath()) "sp-companion-gui-$stamp"
}

$SessionRoot = [System.IO.Path]::GetFullPath($SessionRoot)
$HomeDir = Join-Path $SessionRoot "home"
$AppData = Join-Path $HomeDir "AppData\Roaming"
$LocalAppData = Join-Path $HomeDir "AppData\Local"
$SuperProductivityUserData = Join-Path $SessionRoot "super-productivity-user-data"
$LogDir = Join-Path $SessionRoot "logs"

function Test-ElectronPackage {
  param(
    [Parameter(Mandatory = $true)]
    [string] $Root
  )

  $electronRoot = Join-Path $Root "node_modules\electron"
  $pathFile = Join-Path $electronRoot "path.txt"
  if (-not (Test-Path $electronRoot) -or -not (Test-Path $pathFile)) {
    return $false
  }

  $relativePath = (Get-Content $pathFile -Raw).Trim()
  if (-not $relativePath) {
    return $false
  }

  return Test-Path (Join-Path (Join-Path $electronRoot "dist") $relativePath)
}

$missingDeps = @()
if (-not (Test-ElectronPackage $ClawdRoot)) {
  $missingDeps += "clawd-on-desk Electron dependency is missing or incomplete. Run: cd `"$ClawdRoot`"; npm.cmd ci"
}
if (-not (Test-ElectronPackage $SuperProductivityRoot)) {
  $missingDeps += "super-productivity Electron dependency is missing or incomplete. Run: cd `"$SuperProductivityRoot`"; npm.cmd ci"
}
if ($missingDeps.Count) {
  throw ($missingDeps -join [Environment]::NewLine)
}

New-Item -ItemType Directory -Force -Path `
  $HomeDir, `
  $AppData, `
  $LocalAppData, `
  $SuperProductivityUserData, `
  $LogDir | Out-Null

function Write-Launcher {
  param(
    [Parameter(Mandatory = $true)]
    [string] $Path,
    [Parameter(Mandatory = $true)]
    [string] $WorkingDirectory,
    [Parameter(Mandatory = $true)]
    [string[]] $CommandLines
  )

  $content = @(
    '$ErrorActionPreference = "Stop"',
    "`$env:USERPROFILE = '$($HomeDir.Replace("'", "''"))'",
    "`$env:HOME = '$($HomeDir.Replace("'", "''"))'",
    "`$env:APPDATA = '$($AppData.Replace("'", "''"))'",
    "`$env:LOCALAPPDATA = '$($LocalAppData.Replace("'", "''"))'",
    '$env:ELECTRON_RUN_AS_NODE = ""',
    "Set-Location '$($WorkingDirectory.Replace("'", "''"))'"
  ) + $CommandLines

  Set-Content -Path $Path -Value $content -Encoding UTF8
}

$FrontendLauncher = Join-Path $SessionRoot "start-sp-frontend.ps1"
$SuperProductivityLauncher = Join-Path $SessionRoot "start-sp-electron.ps1"
$ClawdLauncher = Join-Path $SessionRoot "start-clawd.ps1"
$ChecklistPath = Join-Path $SessionRoot "manual-verification-checklist.md"

if (-not $SkipElectronBuild) {
  Push-Location $SuperProductivityRoot
  try {
    npm.cmd run electron:build
  } finally {
    Pop-Location
  }
}

Write-Launcher `
  -Path $FrontendLauncher `
  -WorkingDirectory $SuperProductivityRoot `
  -CommandLines @(
    'npm.cmd run startFrontend'
  )

Write-Launcher `
  -Path $SuperProductivityLauncher `
  -WorkingDirectory $SuperProductivityRoot `
  -CommandLines @(
    '$env:NODE_ENV = "DEV"',
    "& .\node_modules\.bin\electron.cmd . --user-data-dir='$($SuperProductivityUserData.Replace("'", "''"))'"
  )

Write-Launcher `
  -Path $ClawdLauncher `
  -WorkingDirectory $ClawdRoot `
  -CommandLines @(
    'npm.cmd start'
  )

Set-Content -Path $ChecklistPath -Encoding UTF8 -Value @"
# Companion GUI Verification Checklist

Session root: `$SessionRoot`

This session uses isolated environment variables:

- `USERPROFILE` / `HOME`: `$HomeDir`
- `APPDATA`: `$AppData`
- `LOCALAPPDATA`: `$LocalAppData`
- Super Productivity `--user-data-dir`: `$SuperProductivityUserData`

Expected isolation:

- Clawd runtime discovery file lives at `$HomeDir\.clawd\runtime.json`.
- Clawd preferences/logs use the temporary app data directories.
- Super Productivity user data lives under `$SuperProductivityUserData`.

Manual checks:

1. Wait for the Angular dev server window to show `Compiled successfully` or a ready localhost message.
2. In the Super Productivity window, complete any first-run setup needed for the temporary profile.
3. Enable the desktop companion integration setting in Super Productivity.
4. Confirm Clawd is visible and Super Productivity publishes state to it.
5. Create a task in Super Productivity and start tracking it.
6. Confirm Clawd switches to the working visual state.
7. Pause, resume, stop, switch, and complete the current task from Super Productivity and confirm Clawd updates.
8. Use Clawd's Super Productivity menu entries:
   - Open Super Productivity
   - Open Current Task
   - Pause Current Task
   - Resume Current Task
   - Stop Current Task
   - Complete Current Task
   - Quick Add Task from Clipboard
9. Confirm one menu command causes one expected Super Productivity-owned state change.
10. Add day/reminder data if available and confirm compact day summary plus attention/overdue/finished-day visuals.
11. Close one app at a time and confirm the other fails quietly.

Cleanup:

- Close the three launched PowerShell windows.
- Remove `$SessionRoot` after collecting any notes you want to keep.
"@

$frontendProcess = Start-Process `
  -FilePath "powershell.exe" `
  -ArgumentList @("-NoExit", "-ExecutionPolicy", "Bypass", "-File", $FrontendLauncher) `
  -WorkingDirectory $SuperProductivityRoot `
  -PassThru

Start-Sleep -Seconds 8

$superProductivityProcess = Start-Process `
  -FilePath "powershell.exe" `
  -ArgumentList @("-NoExit", "-ExecutionPolicy", "Bypass", "-File", $SuperProductivityLauncher) `
  -WorkingDirectory $SuperProductivityRoot `
  -PassThru

$clawdProcess = Start-Process `
  -FilePath "powershell.exe" `
  -ArgumentList @("-NoExit", "-ExecutionPolicy", "Bypass", "-File", $ClawdLauncher) `
  -WorkingDirectory $ClawdRoot `
  -PassThru

$pidLines = @(
  "frontend=$($frontendProcess.Id)",
  "superProductivity=$($superProductivityProcess.Id)",
  "clawd=$($clawdProcess.Id)"
)
Set-Content -Path (Join-Path $SessionRoot "pids.txt") -Value $pidLines -Encoding UTF8

Write-Host ""
Write-Host "Companion GUI verification session started."
Write-Host "Session root: $SessionRoot"
Write-Host "Checklist: $ChecklistPath"
Write-Host "PID file: $(Join-Path $SessionRoot "pids.txt")"
Write-Host ""
Write-Host "Close the launched PowerShell windows when the manual verification is finished."
