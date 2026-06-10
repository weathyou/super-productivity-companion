$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path -Parent $PSScriptRoot
$ClawdRoot = Join-Path $RepoRoot "clawd-on-desk"
$SuperProductivityRoot = Join-Path $RepoRoot "super-productivity"

function Test-PowerShellSyntax {
  param(
    [Parameter(Mandatory = $true)]
    [string] $Path
  )

  $parseErrors = $null
  [System.Management.Automation.Language.Parser]::ParseFile(
    $Path,
    [ref] $null,
    [ref] $parseErrors
  ) | Out-Null

  if ($parseErrors -and $parseErrors.Count) {
    $parseErrors | Format-List * | Out-String | Write-Host
    throw "PowerShell syntax check failed: $Path"
  }
}

function Invoke-Step {
  param(
    [Parameter(Mandatory = $true)]
    [string] $Name,
    [Parameter(Mandatory = $true)]
    [string] $WorkingDirectory,
    [Parameter(Mandatory = $true)]
    [string] $Command,
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]] $Arguments
  )

  Write-Host ""
  Write-Host "==> $Name"
  Push-Location $WorkingDirectory
  try {
    & $Command @Arguments
    if ($LASTEXITCODE -ne 0) {
      throw "Step failed with exit code $LASTEXITCODE`: $Name"
    }
  } finally {
    Pop-Location
  }
}

Write-Host ""
Write-Host "==> PowerShell verification script syntax"
Test-PowerShellSyntax (Join-Path $RepoRoot "scripts\start-companion-gui-verification.ps1")
Write-Host "PowerShell syntax OK"

Invoke-Step `
  "Clawd companion bridge smoke" `
  $ClawdRoot `
  "npm.cmd" `
  "run" "verify:super-productivity-companion"

Invoke-Step `
  "Clawd companion route, menu, command, and state tests" `
  $RepoRoot `
  "node" `
  "--test" `
  "clawd-on-desk/test/productivity-command-client.test.js" `
  "clawd-on-desk/test/menu-display.test.js" `
  "clawd-on-desk/test/server-route-productivity-state.test.js" `
  "clawd-on-desk/test/state.test.js"

Invoke-Step `
  "Super Productivity Electron main-process tests" `
  $SuperProductivityRoot `
  "npm.cmd" `
  "run" "test:electron"

Invoke-Step `
  "Super Productivity companion command handler spec" `
  $SuperProductivityRoot `
  "npm.cmd" `
  "run" "test:file" "--" "src/app/core/electron/local-rest-api-handler.service.spec.ts"

Invoke-Step `
  "Super Productivity companion state builder spec" `
  $SuperProductivityRoot `
  "npm.cmd" `
  "run" "test:file" "--" "src/app/core/electron/desktop-companion-state-builder.service.spec.ts"

Invoke-Step `
  "Super Productivity companion publisher spec" `
  $SuperProductivityRoot `
  "npm.cmd" `
  "run" "test:file" "--" "src/app/core/electron/desktop-companion-publisher.service.spec.ts"

Invoke-Step `
  "Super Productivity Electron build" `
  $SuperProductivityRoot `
  "npm.cmd" `
  "run" "electron:build"

Write-Host ""
Write-Host "Companion integration verification passed."
