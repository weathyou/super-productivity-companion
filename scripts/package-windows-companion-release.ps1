param(
  [string] $Version = "",
  [string] $ArtifactRoot = "",
  [string] $SuperProductivityBuildDir = "",
  [string] $ClawdBuildDir = "",
  [string] $MakensisPath = ""
)

$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path -Parent $PSScriptRoot
if (-not $Version) {
  if ($env:GITHUB_REF_NAME) {
    $Version = $env:GITHUB_REF_NAME -replace '^v', ''
  } else {
    $Version = "0.0.0-local"
  }
}

if (-not $ArtifactRoot) {
  $ArtifactRoot = Join-Path $RepoRoot "release-artifacts"
}
if (-not $SuperProductivityBuildDir) {
  $SuperProductivityBuildDir = Join-Path $RepoRoot "super-productivity\.tmp\app-builds"
}
if (-not $ClawdBuildDir) {
  $ClawdBuildDir = Join-Path $RepoRoot "clawd-on-desk\dist"
}

$ArtifactRoot = [System.IO.Path]::GetFullPath($ArtifactRoot)
$SuperProductivityBuildDir = [System.IO.Path]::GetFullPath($SuperProductivityBuildDir)
$ClawdBuildDir = [System.IO.Path]::GetFullPath($ClawdBuildDir)
$InstallerScript = Join-Path $RepoRoot "build\windows-companion-installer.nsi"

if (-not (Test-Path $InstallerScript)) {
  throw "NSIS script not found: $InstallerScript"
}

if (-not $MakensisPath) {
  $candidatePaths = @(
    (Join-Path ${env:ProgramFiles(x86)} "NSIS\makensis.exe"),
    (Join-Path $env:ProgramFiles "NSIS\makensis.exe"),
    "makensis.exe"
  )
  foreach ($candidate in $candidatePaths) {
    if (Get-Command $candidate -ErrorAction SilentlyContinue) {
      $MakensisPath = (Get-Command $candidate).Source
      break
    }
  }
}
if (-not $MakensisPath) {
  throw "makensis.exe was not found. Install NSIS or pass -MakensisPath."
}

New-Item -ItemType Directory -Force -Path $ArtifactRoot | Out-Null

function Copy-BackupInstaller {
  param(
    [Parameter(Mandatory = $true)]
    [System.IO.FileInfo] $Source,
    [Parameter(Mandatory = $true)]
    [string] $Name
  )

  $destination = Join-Path $ArtifactRoot $Name
  Copy-Item -LiteralPath $Source.FullName -Destination $destination -Force
  return $destination
}

function Find-One {
  param(
    [Parameter(Mandatory = $true)]
    [string] $Path,
    [Parameter(Mandatory = $true)]
    [string] $Pattern
  )

  $matches = Get-ChildItem -Path $Path -Filter $Pattern -File -ErrorAction Stop |
    Sort-Object LastWriteTime -Descending

  if (-not $matches) {
    throw "No file matched '$Pattern' in $Path"
  }
  return $matches[0]
}

foreach ($arch in @("x64", "arm64")) {
  $spInstaller = Find-One $SuperProductivityBuildDir "Super-Productivity-Setup-$arch.exe"
  $clawdInstaller = Find-One $ClawdBuildDir "Clawd-on-Desk-Setup-*-$arch.exe"

  Copy-BackupInstaller $spInstaller "Super-Productivity-Setup-$arch.exe" | Out-Null
  Copy-BackupInstaller $clawdInstaller $clawdInstaller.Name | Out-Null

  $outFile = Join-Path $ArtifactRoot "Super-Productivity-Companion-Setup-$arch.exe"
  & $MakensisPath `
    "/DPRODUCT_VERSION=$Version" `
    "/DARCH=$arch" `
    "/DSP_INSTALLER=$($spInstaller.FullName)" `
    "/DCLAWD_INSTALLER=$($clawdInstaller.FullName)" `
    "/DOUT_FILE=$outFile" `
    $InstallerScript

  if ($LASTEXITCODE -ne 0) {
    throw "NSIS failed for $arch with exit code $LASTEXITCODE"
  }
  if (-not (Test-Path $outFile)) {
    throw "Expected companion installer was not created: $outFile"
  }
}

$releaseNotesPath = Join-Path $ArtifactRoot "release-notes.md"
Set-Content -Path $releaseNotesPath -Encoding UTF8 -Value @"
# Super Productivity Companion $Version

This Windows companion release installs Super Productivity and Clawd on Desk together.

- The desktop companion bridge is enabled by default in this companion build.
- Communication is local-only on `127.0.0.1`.
- Clawd can only call the existing narrow companion command set exposed by Super Productivity.
- These installers are not code-signed yet, so Windows SmartScreen may show an unknown-publisher warning.

Use `Super-Productivity-Companion-Setup-x64.exe` for most Windows PCs. Use the arm64 installer only for Windows on ARM.
"@

$checksumPath = Join-Path $ArtifactRoot "checksums.txt"
Get-ChildItem -Path $ArtifactRoot -File |
  Where-Object { $_.Name -ne "checksums.txt" } |
  Sort-Object Name |
  ForEach-Object {
    $hash = Get-FileHash -Algorithm SHA256 -LiteralPath $_.FullName
    "$($hash.Hash.ToLowerInvariant())  $($_.Name)"
  } |
  Set-Content -Path $checksumPath -Encoding ASCII

Write-Host "Packaged Windows companion release artifacts:"
Get-ChildItem -Path $ArtifactRoot -File | Sort-Object Name | ForEach-Object {
  Write-Host "- $($_.FullName)"
}
