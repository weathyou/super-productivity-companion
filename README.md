# Super Productivity Companion

This repository is an integrated desktop companion prototype that connects
[Super Productivity](https://super-productivity.com/) with the Clawd on Desk
desktop pet runtime.

Super Productivity remains the source of truth for tasks, timers, reminders,
daily progress, and task mutations. Clawd provides the lightweight desktop
companion layer: a visible pet, tray/menu actions, visual state changes, and
small productivity affordances on the desktop.

## What It Does

- Publishes Super Productivity desktop state to Clawd as local snapshots.
- Shows companion visuals for productivity states such as idle, working,
  paused, attention, overdue, and finished day.
- Displays current-task and compact day-summary context in Clawd menus.
- Sends narrow companion commands from Clawd back to Super Productivity:
  open app, open current task, pause, resume, stop, complete, and quick add.
- Keeps all task changes owned by Super Productivity rather than duplicating
  task logic inside Clawd.
- Uses local desktop-only communication between the two apps.

## Repository Layout

```text
.
+-- clawd-on-desk/          # Clawd desktop companion runtime
+-- super-productivity/     # Super Productivity app with companion bridge
`-- scripts/                # Cross-project verification and launch scripts
```

The integration work is intended to happen inside this repository root. Do not
continue follow-up work in an older external Clawd checkout.

## Requirements

- Windows with PowerShell
- Node.js and npm
- Git
- Chrome or Chromium for Angular/Karma tests
- NSIS when building the combined Windows installer locally

Use `npm.cmd` from PowerShell when running npm commands in this repo.

## Windows One-Click Release

Public releases for this companion are intended to provide combined Windows
installers:

```text
Super-Productivity-Companion-Setup-x64.exe
Super-Productivity-Companion-Setup-arm64.exe
```

Most Windows PCs should use the `x64` installer. Windows on ARM devices should
use the `arm64` installer.

The combined installer installs and tries to launch both Super Productivity and
Clawd on Desk. In this companion build, the Super Productivity desktop
companion bridge is enabled by default. Communication stays local to
`127.0.0.1`, and Clawd can only request actions through the narrow companion
command set exposed by Super Productivity.

The first combined release is unsigned, so Windows SmartScreen may show an
unknown-publisher warning.

GitHub Actions builds the release from:

```text
.github/workflows/release-windows-companion.yml
```

After local Windows installers already exist for both apps, the combined
installer can also be packaged locally:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\package-windows-companion-release.ps1 -Version 0.1.0
```

## Install Dependencies

From the repository root:

```powershell
cd .\clawd-on-desk
npm.cmd ci

cd ..\super-productivity
npm.cmd ci
```

If native Electron packages are incomplete, rerun the matching `npm.cmd ci`
inside the affected project.

## Verify The Integration

Run the full automated integration gate from the repository root:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\verify-companion-integration.ps1
```

This checks:

- Clawd productivity-state bridge smoke test
- Clawd route, menu, command-client, and state tests
- Super Productivity Electron main-process tests
- Super Productivity companion command/state/publisher specs
- Super Productivity Electron build

Expected success message:

```text
Companion integration verification passed.
```

## Run Manual GUI Verification

For visible two-app testing, use the isolated launcher:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\start-companion-gui-verification.ps1
```

The script starts:

- Super Productivity Angular dev server
- Super Productivity Electron app with companion publishing forced on
- Clawd on Desk

It uses a temporary session directory under your system temp folder, so the
test does not touch your normal Super Productivity or Clawd profile. The script
prints a checklist path when it starts.

Useful options:

```powershell
# Skip rebuilding Electron if it was already built
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\start-companion-gui-verification.ps1 -SkipElectronBuild

# Stop processes occupying required local dev ports
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\start-companion-gui-verification.ps1 -StopConflictingPorts
```

During manual verification:

1. Wait for the Angular dev server to become ready.
2. Complete any first-run setup in the temporary Super Productivity profile.
3. Enable the desktop companion integration setting if needed.
4. Create and start a task in Super Productivity.
5. Confirm Clawd changes visual state.
6. Try Clawd's Super Productivity menu commands.
7. Close one app at a time and confirm the other fails quietly.

## Development Commands

Run Clawd directly:

```powershell
cd .\clawd-on-desk
npm.cmd start
```

Run Super Productivity desktop dev mode:

```powershell
cd .\super-productivity
npm.cmd run start
```

Build Super Productivity Electron files:

```powershell
cd .\super-productivity
npm.cmd run electron:build
```

Run Clawd's companion smoke test only:

```powershell
cd .\clawd-on-desk
npm.cmd run verify:super-productivity-companion
```

## How The Bridge Works

Super Productivity builds a small snapshot of productivity state and publishes
it from the Electron app to Clawd's local endpoint:

```text
POST http://127.0.0.1:<clawd-port>/productivity-state
```

Clawd discovers and stores that state separately from its legacy agent session
state, then maps the productivity mode to existing companion visuals.

Commands flow in the other direction through Super Productivity's local
desktop command endpoint:

```text
POST http://127.0.0.1:<super-productivity-port>/companion-command
```

Only a narrow command set is exposed. Clawd asks for actions; Super
Productivity decides how to mutate tasks and timers.

## Current Status

The core bridge and companion commands are implemented and covered by focused
automated tests. The remaining important work is real two-app manual
verification for command behavior, reminder/day-summary display, and quiet
failure handling.

See the detailed project plan:

```text
super-productivity/docs/plans/2026-06-09-desktop-companion-integration.md
```
