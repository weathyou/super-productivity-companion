# Desktop Companion Integration

**Date:** 2026-06-09
**Status:** Phase 1 manually verified; Phase 2-4 implemented and covered by focused automated tests; Phase 2-4 real two-app manual verification pending
**Scope:** Product and architecture plan for integrating Super Productivity with the Clawd desktop companion.

## Implementation progress

Updated on 2026-06-09:

- Clawd endpoint and state sink exist at `POST /productivity-state`.
- Clawd stores productivity snapshots separately from agent sessions.
- Clawd maps productivity modes to display states and falls back after a stale timeout.
- Clawd maps `overdue` to notification and `finishedDay` to attention for Phase 3 visual nudges.
- Super Productivity has a Phase 1 snapshot builder for `mode`, `currentTask`, and `timer`.
- Super Productivity snapshots now include a lightweight `day` summary, `nextReminder`, and derive `attention` / `overdue` / `finishedDay` modes.
- Super Productivity has an opt-in desktop-only setting for companion publishing.
- Super Productivity publishes complete snapshots through a narrow Electron IPC bridge.
- The Electron main process discovers Clawd through `~/.clawd/runtime.json` plus ports `23333-23337`, then posts to `/productivity-state`.
- The publisher debounces state changes, skips duplicate snapshots, fails quietly when Clawd is unavailable, and disables the session on a confirmed Clawd schema mismatch.
- Super Productivity exposes a narrow `POST /companion-command` route for `openApp`, current-task open/pause/resume/stop/complete, and `quickAddTask`.
- Clawd sends companion commands through the integrated `clawd-on-desk/` command client and exposes them from the tray and pet context menus.
- Clawd tray and pet context menus show a compact read-only day summary when Super Productivity publishes `day` data.

Verified so far:

- Clawd route/unit tests for productivity state passed before the Super Productivity publisher work.
- Super Productivity snapshot builder and publisher unit tests passed.
- Super Productivity `electron:build` passed.
- A local smoke test with a fake Clawd receiver confirmed runtime-port discovery, payload envelope shape, success handling, and schema-mismatch handling.
- Electron binary installation was repaired locally for both repositories.
- Clawd full test suite passed after repairing Electron.
- A real Clawd Electron server smoke test accepted `POST /productivity-state` on `127.0.0.1:23333`.
- The compiled Super Productivity Electron publisher successfully discovered the real Clawd runtime file and published a snapshot to the real Clawd server.
- Focused Clawd command client, menu, productivity route, and state tests passed for Phase 2-4 behavior.
- Focused Super Productivity local companion command and desktop companion state builder specs passed for Phase 2-4 behavior.
- Super Productivity `electron:build` passed after the Phase 2-4 changes.
- `npm.cmd run verify:super-productivity-companion` in `clawd-on-desk/` passes a repeatable bridge smoke test: it starts the real Clawd HTTP server module, posts a Super Productivity snapshot to `/productivity-state`, verifies Clawd runtime state, and confirms Clawd command-client POST payloads against a fake Super Productivity `/companion-command` receiver.
- `npm.cmd run test:electron` in `super-productivity/` now covers the main-process local REST server path for desktop companion commands: enabling the companion starts the server, `POST /companion-command` is focused and forwarded to the renderer over IPC, disabled companion commands return 403, and broader local REST routes remain disabled when only the companion integration is enabled.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\verify-companion-integration.ps1` from the integrated project root runs the companion integration gate across both codebases.

Phase 1 manual verification:

- Real two-app manual loop completed with Clawd UI visible and Super Productivity desktop publishing enabled.
- Companion visual state changes were confirmed for start, pause, stop, and task switch.
- The "open Super Productivity" action is deferred to Phase 2 together with companion commands.

Phase 2-4 manual verification still needed:

- Use `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\start-companion-gui-verification.ps1` from the integrated project root to launch Clawd, the Super Productivity Angular dev server, and the Super Productivity Electron app in an isolated temporary HOME/APPDATA/userData session for visible GUI verification.
- Trigger Clawd menu commands against a running Super Productivity desktop app and confirm open app, open task, pause, resume, stop, complete, and quick add each cause one expected Super Productivity-owned state change.
- Confirm reminder attention, overdue, finished-day, and compact day summary display in the real Clawd UI with real Super Productivity data.
- Confirm the bridge still fails quietly when either desktop app is closed during Phase 2-4 command and display flows.

## Context

Super Productivity already owns the user's task, time tracking, planning, reminder, break, and finish-day state. Clawd on Desk already owns a mature desktop companion runtime: transparent always-on-top windows, animation state rendering, themes, mini mode, dragging, tray/menu behavior, permission bubbles, session HUDs, and agent hook integrations.

The intended combined product is not "Super Productivity sends another stream of agent-like events to Clawd." The intended model is a desktop productivity companion: Super Productivity is the source of truth, while Clawd is the lightweight desktop presentation and interaction layer.

This plan is separate from `2026-06-08-plugin-hosted-integrations.md`. Plugin-hosted integrations are about extracting issue/calendar/file providers behind plugin contracts. Desktop companion integration is about reusing Clawd's desktop runtime with Super Productivity's own productivity state.

## Repository boundary

As of 2026-06-10, `D:\AI_coding\super-productivity-companion` is the integrated project root for this work.

All future implementation, tests, docs, and verification notes for this integration should be made inside this project root:

- Super Productivity code lives under `super-productivity/`.
- Clawd companion runtime code lives under `clawd-on-desk/`.

Do not implement follow-up integration work in the external historical Clawd checkout at `D:\AI_coding\clawd-on-desk`. If earlier notes mention that external path, treat them as pre-integration inventory references and migrate the relevant work into `clawd-on-desk/` inside this project before continuing.

GitHub updates for this integration should use the repository rooted at `D:\AI_coding\super-productivity-companion`.

## Target model

Super Productivity owns the factual productivity state:

- Current task and active work context.
- Timer running/paused/stopped state.
- Break, focus, idle, and finish-day state.
- Reminders, due tasks, and planned schedule signals.
- Task commands such as start, pause, stop, complete, open, and quick add.

Clawd owns the companion presentation:

- Desktop pet window, transparent hit area, dragging, click-through behavior, and multi-monitor positioning.
- Animation mapping from productivity mode to visual state.
- Mini mode, DND-like quiet behavior, tray/menu affordances, and theme loading.
- Lightweight task companion UI such as hover text, a compact current-task menu, and visual attention states.

The combined app should feel like one product. Clawd should not look like a separate agent monitor that happens to receive Super Productivity events.

## Current decisions

- The default state source for the combined product is Super Productivity, not agent hooks.
- The first integration should be snapshot-driven, not event-stream-driven.
- Clawd's mature desktop runtime should be reused, not rewritten.
- Agent integrations should be preserved as optional legacy/advanced capabilities.
- Task mutations must stay owned by Super Productivity.
- The first version should be desktop-only and local-only.
- The integration should be feature-flagged or opt-in while the product shape settles.

## Non-goals

- Do not rewrite Clawd's rendering, theme, window, or positioning systems.
- Do not delete existing Clawd agent integrations in the first migration step.
- Do not let Clawd become a second source of truth for task state.
- Do not duplicate Super Productivity reminders, scheduling, or time-tracking rules inside Clawd.
- Do not make agent hook state the default driver for the combined product.
- Do not expose broad NgRx or internal app state to a companion bridge.

## Proposed state contract

Add a stable snapshot-style state model rather than an agent-style event stream. The exact type names can change, but the boundary should be shaped like this:

```typescript
interface ProductivityCompanionState {
  mode:
    | 'idle'
    | 'working'
    | 'paused'
    | 'break'
    | 'planning'
    | 'overdue'
    | 'attention'
    | 'finishedDay';
  currentTask?: {
    id: string;
    title: string;
    projectId?: string;
    tagIds?: string[];
    timeSpentToday?: number;
    estimate?: number;
  };
  timer?: {
    isRunning: boolean;
    startedAt?: number;
    elapsedToday?: number;
  };
  nextReminder?: {
    taskId?: string;
    title: string;
    dueAt: number;
  };
  day?: {
    plannedTaskCount: number;
    completedTaskCount: number;
    totalTrackedMs: number;
  };
}
```

The companion should treat this as a replaceable snapshot. It should not need to infer state from `PreToolUse`, `Stop`, `Notification`, `tool_name`, `session_id`, or other agent concepts.

## Phase 1 state semantics

Phase 1 should only rely on `mode`, `currentTask`, and `timer`. Other fields are allowed in the contract so the shape can grow without another boundary redesign, but they should not be required for the first implementation.

`mode` is the companion's main visual signal:

- `working`: a task is actively being tracked.
- `paused`: a current task exists, but tracking is paused.
- `break`: Super Productivity is in a break or focus-rest state.
- `idle`: no task is currently being tracked and no special attention state is active.
- `attention`, `overdue`, `planning`, and `finishedDay`: reserved for later phases.

`currentTask` is display context, not authority. Clawd may show it, but must not treat it as proof that the task still exists when sending commands back.

`timer` describes the active time-tracking state. If `timer.isRunning` is true, `mode` should usually be `working`; if it is false while `currentTask` exists, `mode` should usually be `paused`.

Recommended mode precedence for Phase 1:

1. Break mode wins over normal task display.
2. Running timer with a current task maps to `working`.
3. Current task without a running timer maps to `paused`.
4. No current task maps to `idle`.

The bridge should send complete snapshots. It should not send partial patches.

## Integration boundary

Prefer a narrow bridge from Super Productivity to the companion runtime:

- Super Productivity computes the companion snapshot from existing services and store selectors.
- The bridge publishes snapshots only when relevant state changes, with basic throttling/debouncing.
- Clawd receives snapshots through a dedicated productivity-state endpoint or IPC channel.
- Clawd maps `ProductivityCompanionState.mode` to its existing visual state machine.
- Commands flow back through explicit Super Productivity-owned actions or local API endpoints.

The initial bridge can be local-only and desktop-only. Web and mobile should ignore the companion integration unless a later design introduces a remote companion concept.

## Candidate transport

There are two plausible transport shapes.

### Two-process local bridge

Keep Super Productivity and Clawd as separate Electron apps at first. Super Productivity publishes a companion snapshot to a local Clawd endpoint, and Clawd exposes a small command surface back to Super Productivity.

Benefits:

- Lowest disruption to both codebases.
- Preserves Clawd packaging, tray behavior, themes, and legacy agent features.
- Easier to test the bridge without merging build systems.

Costs:

- Requires local process discovery and failure handling.
- Settings may initially live in two places.
- Product still consists of two executables until a later packaging decision.

### Single-app embedded companion

Move Clawd's desktop runtime into Super Productivity's Electron shell.

Benefits:

- Feels more like one product.
- One settings system, one lifecycle, one update mechanism.
- No local HTTP discovery between apps.

Costs:

- Higher migration risk.
- Clawd's windowing, tray, updater, permission, and hook systems overlap with Super Productivity's Electron shell.
- Harder to preserve legacy agent integrations cleanly.

Recommendation for Phase 1: start with the two-process bridge, while designing the state contract so it can later be reused by an embedded companion runtime.

## Local API draft

For the two-process bridge, prefer a new Clawd endpoint instead of overloading the existing agent-oriented `/state` endpoint:

```text
POST http://127.0.0.1:<clawd-port>/productivity-state
Content-Type: application/json
```

Request body:

```typescript
interface ProductivityStateRequest {
  source: 'super-productivity';
  schemaVersion: 1;
  sentAt: number;
  state: ProductivityCompanionState;
}
```

Response body:

```typescript
interface ProductivityStateResponse {
  ok: true;
  acceptedSchemaVersion: 1;
}
```

Recommended companion command endpoint for later Phase 2:

```text
POST http://127.0.0.1:<super-productivity-port>/companion-command
Content-Type: application/json
```

Command body:

```typescript
type CompanionCommand =
  | { type: 'openApp' }
  | { type: 'quickAddTask'; title: string }
  | { type: 'openCurrentTask'; taskId: string }
  | { type: 'pauseCurrentTask'; taskId: string }
  | { type: 'resumeCurrentTask'; taskId: string }
  | { type: 'stopCurrentTask'; taskId: string }
  | { type: 'completeCurrentTask'; taskId: string };
```

Phase 1 should not include a command path. `openApp` and task mutation commands belong to Phase 2.

Failure behavior:

- If Clawd is not reachable, Super Productivity should silently stop publishing until the next retry window.
- If the companion state endpoint rejects the schema version, Super Productivity should disable publishing for that app session and log only a non-sensitive diagnostic.
- If Super Productivity is closed, Clawd should naturally fall back to idle after a timeout or keep its last visual state for a short grace period before idle.
- Neither side should show error notifications for normal "other app is not running" cases.

Manual Phase 1 endpoint smoke payload:

```json
{
  "source": "super-productivity",
  "schemaVersion": 1,
  "sentAt": 1781000000000,
  "state": {
    "mode": "working",
    "currentTask": {
      "id": "demo-task",
      "title": "Demo task"
    },
    "timer": {
      "isRunning": true,
      "elapsedToday": 120000
    }
  }
}
```

The first Clawd implementation can validate behavior with a direct local request before Super Productivity publishes anything:

```bash
curl -X POST http://127.0.0.1:23333/productivity-state \
  -H "Content-Type: application/json" \
  --data @payload.json
```

The real implementation should discover the active Clawd port instead of hard-coding `23333`, but a fixed local port is useful for manual smoke tests.

## Useful existing paths

Super Productivity state and command sources:

- `src/app/features/tasks/` for task state, task details, and task commands.
- `src/app/features/tasks/task.service.ts` for current-task and task mutation behavior.
- `src/app/features/issue/` only when issue-linked task metadata affects companion display.
- `src/app/features/planner/` and `src/app/features/schedule/` for planned work and schedule signals.
- `src/app/features/reminder/` for task reminder signals.
- `src/app/features/worklog/` for day/worklog summaries.
- `src/app/core/electron/local-rest-api-handler.service.ts` for existing local desktop command/API patterns.
- `electron/preload.ts` for Electron-only bridge surfaces.

Clawd presentation and companion runtime:

- `clawd-on-desk/src/main.js` for Electron windows, lifecycle, and IPC.
- `clawd-on-desk/src/state.js` for the current visual state machine.
- `clawd-on-desk/src/renderer.js` for animation rendering.
- `clawd-on-desk/src/tick.js` for mouse/idle visual loop behavior.
- `clawd-on-desk/src/hit-renderer.js`, `clawd-on-desk/src/hit-geometry.js`, and `clawd-on-desk/src/drag-position.js` for interaction and dragging.
- `clawd-on-desk/src/mini.js` for mini mode.
- `clawd-on-desk/src/theme-loader.js` and `clawd-on-desk/themes/` for theme support.
- `clawd-on-desk/src/server.js` and `clawd-on-desk/src/server-route-state.js` for the existing local state input model.

## Phase 0 discovery checklist

Before implementation, verify the exact source APIs instead of guessing from names:

- Identify the narrowest Super Productivity observable/selectors for current task, active timer, break/focus mode, reminders, and finish-day state.
- Confirm which existing local REST commands can open, pause, stop, and complete the current task.
- Confirm whether Super Productivity already exposes enough Electron IPC for local-only companion commands.
- Confirm Clawd's current state machine can accept a new source namespace without mixing with agent sessions.
- Decide whether Clawd needs a new `/productivity-state` endpoint or whether the current `/state` endpoint can be adapted safely.
- Decide where the opt-in setting should live for Phase 1.
- Define a privacy rule for showing task titles on the desktop and in logs.

Phase 0 deliverables:

- A short list of exact Super Productivity selectors/services to use for Phase 1.
- A short list of exact Clawd functions that should consume productivity snapshots.
- A decision on endpoint naming and schema versioning.
- A decision on whether task titles are shown by default or only on hover/click.
- A test note describing how to manually verify state changes without real user data.

## Confirmed Phase 0 inventory

These paths were verified during planning and should be the first places to inspect before implementation.

Super Productivity:

- `src/app/features/tasks/task.service.ts`
  - `currentTaskId$` selects `selectCurrentTaskId`.
  - `currentTaskId` exposes a signal wrapper for the current task id.
  - `currentTask$` selects `selectCurrentTask`.
  - `currentTaskProgress$` derives progress from `timeSpent / timeEstimate`.
  - `pauseCurrent()` dispatches `unsetCurrentTask()`.
  - `setCurrentId(...)` is used by the local REST task-control routes.
- `src/app/features/tasks/store/task.actions.ts`
  - `setCurrentTask({ id })` sets the active task.
  - `unsetCurrentTask()` clears the active task.
- `src/app/core/electron/local-rest-api-handler.service.ts`
  - `GET /status` returns `currentTask`, `currentTaskId`, and `taskCount`.
  - `GET /task-control/current` returns the current task.
  - `POST /task-control/stop` clears the current task.
  - `POST /task-control/current` sets or clears the current task.
- `electron/preload.ts`
  - Exposes `onLocalRestApiRequest(...)` and `sendLocalRestApiResponse(...)` for the renderer-side local REST handler.

Clawd:

- `clawd-on-desk/src/server.js`
  - Existing local server routes `GET /state` and `POST /state`.
- `clawd-on-desk/src/server-route-state.js`
  - `handleStatePost(...)` parses agent-oriented state payloads.
  - `/state` currently expects fields such as `state`, `session_id`, `event`, `agent_id`, `hook_source`, `tool_name`, and process metadata.
  - This confirms that a new `/productivity-state` endpoint is preferable to overloading `/state`.
- `clawd-on-desk/src/state.js`
  - `setState(...)`, `applyState(...)`, and `resolveDisplayState(...)` are the key visual state functions.
  - Existing session state lives in a `sessions` map and should not be mixed with productivity snapshots.
  - Current public runtime exports include `getCurrentState()`, `getCurrentSvg()`, `STATE_SVGS`, and `sessions`.

Open Phase 0 source checks:

- Identify the exact Super Productivity source for break/focus state.
- Identify whether a "timer running" boolean exists independently from `currentTaskId`, or whether Phase 1 should derive running from current task presence.
- Identify the safest Super Productivity command to open the app and, later, open a specific task.
- Identify the best Clawd hook point for a productivity snapshot timeout to idle.

## Why not reuse `/state`

The existing Clawd `/state` route is a mature agent integration endpoint, not a generic visual-state endpoint. Reusing it for Super Productivity would blur several boundaries:

- It creates or updates agent sessions, while productivity state should be a single app-level snapshot.
- It accepts agent identity fields such as `agent_id`, `hook_source`, `session_id`, and process metadata.
- It participates in permission cleanup and completion heuristics that are irrelevant to task tracking.
- It applies agent enable/disable gates, DND behavior, session snapshot broadcasts, and stale session cleanup.

The companion integration should add a smaller route with its own validation and state sink. If the implementation later wants to reuse visual rendering helpers, it can call `setState(...)` or another narrow state-runtime method after validation.

## Worth integrating

### Current task companion

Show the active task as the companion's primary context. Hover or click can reveal the current task title, elapsed time, project, and tags. This should stay compact and not become a second task panel.

### Time tracking control

Expose a small set of commands from the companion:

- Open Super Productivity.
- Pause or resume the current task timer.
- Stop the current task.
- Complete the current task.

These commands must flow through Super Productivity-owned command paths so sync and task-state rules remain intact.

### Break and focus rhythm

Map Super Productivity focus, break, paused, idle, and working states to companion animation states. This gives a more truthful signal than agent hook activity, where "tool running" does not always mean "user productively working."

### Reminder and due attention

Use existing Super Productivity reminders and due-task logic to drive visual attention. The companion should be a visual nudge, not a second notification engine.

### Finish Day feedback

At finish day, the companion can show a short celebratory or wrap-up state using summary data such as completed tasks and tracked time. This is likely one of the highest-value product moments.

### Quick add

Optionally add a restrained quick-add task entry from the companion menu. The task should go through Super Productivity's normal task creation path and default inbox/work-context rules.

### Project and tag visual hints

Later versions can map projects or tags to small visual variants, badges, or color accents. This should come after the core state bridge is stable.

## First implementation slice

The first implementation should be intentionally small:

1. Add an opt-in Super Productivity setting for desktop companion publishing.
2. Add a Super Productivity companion-state builder that derives only `mode`, `currentTask`, and `timer`.
3. Add a local bridge that publishes the latest snapshot when those fields change.
4. Add a Clawd productivity state input that stores the latest snapshot separately from agent session state.
5. Map `working`, `paused`, `idle`, and `break` to existing Clawd visual states.
6. Defer companion actions to Phase 2.

Do not include quick add, reminders, finish-day summary, project/tag visuals, or task completion in the first slice. Those are good features, but they should come after the snapshot contract is proven.

Likely work items:

- Super Productivity: add a companion integration setting, default off.
- Super Productivity: add a desktop-only state builder service.
- Super Productivity: add a local publisher with Clawd port discovery and retry backoff.
- Clawd: add a productivity-state route and validation.
- Clawd: add a separate productivity source in the state layer so agent session state does not mix with task state.
- Clawd: add visual mapping from productivity modes to existing animation states.
- Clawd: add a timeout from stale productivity state to idle.

Likely first tests:

- State builder maps no current task to `idle`.
- State builder maps running current task to `working`.
- State builder maps paused current task to `paused`.
- Clawd productivity route rejects malformed payloads without changing visual state.
- Clawd productivity route stores valid snapshots separately from agent sessions.
- Visual mapping handles `working`, `paused`, `idle`, and `break`.

Recommended implementation order:

1. Implement the Clawd endpoint and state sink first, with a tiny manual payload script or curl command.
2. Verify Clawd can change visuals from productivity snapshots without Super Productivity involved.
3. Implement the Super Productivity state builder with unit tests and no network publishing.
4. Add the Super Productivity publisher behind an opt-in setting.
5. Wire the publisher to the Clawd endpoint and verify the full local loop.
6. Start Phase 2 companion commands only after the display path is stable.

Stop after each step if the previous step is not demonstrably working. This integration crosses two mature apps; narrow checkpoints matter more than speed.

## Agent integration strategy

Clawd's existing agent integrations should be preserved at first, but they should not be the default source of the new product's main state.

Recommended model:

- Default state source: Super Productivity.
- Optional legacy state source: agent hooks.
- Agent hooks disabled for main-state driving unless the user explicitly enables an advanced/legacy mode.
- Existing permission bubbles, remote SSH, Telegram, terminal focus, and agent install flows can remain available while being isolated from the productivity companion state.

This avoids throwing away working Clawd code while preventing mixed event streams from making the companion state unstable.

## Migration phases

### Phase 1: Snapshot bridge and display

Create the minimal state bridge and make Clawd render from `ProductivityCompanionState`.

Scope:

- Current task.
- Timer running/paused/stopped.
- Break or idle mode.
- No companion commands; `openApp` and task commands are deferred to Phase 2.

Verification:

- Starting a task changes the companion to working.
- Pausing/stopping returns it to paused or idle.
- Switching tasks updates the compact task context.
- Clawd still works if Super Productivity is closed or the bridge is disabled.
- Agent integrations remain present but do not drive the default state source.

Implementation notes:

- Keep the Clawd visual state mapping simple at first: `working` can map to the existing working/typing animation, `paused` and `idle` can map to idle/sleep-like states, and `break` can map to a relaxed/sleep state.
- Preserve Clawd's DND and mini mode as presentation preferences. They should affect how the companion displays, not whether Super Productivity state is correct.
- Do not log task titles while debugging bridge traffic.

### Phase 2: Companion commands

Add explicit commands from Clawd back to Super Productivity.

Scope:

- Open/focus Super Productivity.
- Pause/resume timer.
- Stop current task.
- Complete current task.
- Open active task in Super Productivity.

Verification:

- Commands use Super Productivity-owned task APIs/actions.
- One user command produces one task-state change.
- Commands do not bypass sync or task mutation rules.

### Phase 3: Reminders and finish day

Add visual attention for reminders, overdue tasks, and finish-day summary.

Scope:

- Reminder visual state.
- Overdue visual state.
- Finish-day celebration or wrap-up.
- Optional quiet behavior during focus mode.

Verification:

- Existing reminder behavior remains unchanged.
- Companion visuals do not duplicate or suppress Super Productivity notifications unless explicitly designed.
- Finish-day state resets cleanly the next day.

### Phase 4: Quick add and visual personalization

Add a small productivity command surface.

Scope:

- Quick add task.
- Optional project/tag badges or theme variants.
- Optional compact day summary.

Verification:

- Quick add respects existing inbox/work-context defaults.
- Visual personalization remains optional and lightweight.

## Safety and privacy

- Do not send task titles or metadata to external services.
- Keep the bridge local-only by default.
- Avoid logging task titles, notes, issue payloads, or reminder text.
- Treat Clawd as an untrusted presentation boundary for task mutation purposes: it may request commands, but Super Productivity validates and executes them.
- The companion should fail quietly if it is not running.

## Acceptance criteria for Phase 1

- With the integration disabled, neither app changes behavior.
- With Clawd closed, Super Productivity remains fully usable and shows no user-facing errors.
- With Super Productivity closed, Clawd remains usable and eventually returns to an idle companion state.
- Starting a task in Super Productivity changes Clawd to a working visual state within a short delay.
- Pausing or stopping the task changes Clawd to paused or idle.
- Switching tasks updates the companion context without restarting Clawd.
- Existing Clawd agent integrations can remain installed but do not override the productivity state in default mode.
- No task title, note, issue title, or reminder text is written to logs by the bridge.
- Phase 1 does not introduce task mutations from Clawd other than opening the app.

## Open questions

- Should the combined product run as one Electron process or two coordinated local processes?
- If kept as two processes, should the bridge use local HTTP, Electron IPC, or a small localhost discovery file?
- Should Clawd's settings UI be merged into Super Productivity settings, or remain in the companion tray/menu for the first version?
- What is the default behavior for users who still want agent monitoring?
- Should the first version live behind an experimental setting?
- How much task text should the companion show by default on shared screens?
- Should Clawd be renamed/rebranded for the productivity companion mode, or should it keep its current identity?
- Should the companion auto-start with Super Productivity, or should that remain an explicit user choice?

## 2026-06-09 checkpoint

- Super Productivity now initializes the desktop companion publisher from the Electron startup path.
- The publisher waits for `window.ea.publishDesktopCompanionState` with a short retry window, and startup also retries after initial data load.
- Local Clawd discovery and POST to `http://127.0.0.1:23333/productivity-state` were verified from the Electron bridge.
- Runtime smoke from the Super Productivity renderer produced a `working` snapshot with current task and timer data, and the Electron bridge returned `ok: true`.
- Real two-app visual verification passed for start, pause, stop, and task switch.
- Decision: `openApp`, `pauseCurrentTask`, `resumeCurrentTask`, `stopCurrentTask`, `completeCurrentTask`, and `openCurrentTask` all belong in Phase 2 "Companion commands".

## 2026-06-09 Phase 2 checkpoint

- Super Productivity now exposes a narrow `POST /companion-command` route while desktop companion publishing is enabled.
- The local server may start for companion commands without enabling the broader local REST API surface.
- `openApp` focuses Super Productivity through the Electron main process and performs no task mutation.
- `openCurrentTask`, `resumeCurrentTask`, `pauseCurrentTask`, `stopCurrentTask`, and `completeCurrentTask` are handled by Super Productivity-owned task services.
- `openCurrentTask` uses Super Productivity's `NavigateToTaskService` so companion requests route to the task's project/tag/today context and focus the task, instead of only selecting the task detail panel.
- Current-task mutation commands reject stale `taskId` values when the command target no longer matches the active task.
- Clawd command client work should live at `clawd-on-desk/src/productivity-command-client.js` inside this integrated project.
- Clawd tray and pet context menu work should live in `clawd-on-desk/src/menu.js` inside this integrated project.
- Any earlier Clawd-side edits made in an external checkout should be ported into `D:\AI_coding\super-productivity-companion\clawd-on-desk` before further Phase 2 work continues.
- The Clawd command client and Super Productivity menu entries have been migrated into the integrated project and covered by focused Node menu/client tests.

## 2026-06-10 Phase 3 checkpoint

- Super Productivity desktop companion snapshots include `day.plannedTaskCount`, `day.completedTaskCount`, and `day.totalTrackedMs`.
- Super Productivity desktop companion snapshots include `nextReminder` with `taskId`, `title`, and `dueAt` for the active or next upcoming task/deadline reminder.
- A recently due reminder drives `attention` mode for a short window, with a lightweight 30-second builder tick so future reminders can become active without another task edit.
- When no task is active, Super Productivity derives `overdue` if any active task is due or has a deadline before the logical today string.
- When no task is active and all planned/touched tasks for the logical day are complete, Super Productivity derives `finishedDay`.
- Break mode still takes precedence over reminder attention; active work and paused work take precedence over overdue and finished-day visual nudges.
- Clawd preserves the `day` summary from `/productivity-state`.
- Clawd preserves `nextReminder` from `/productivity-state`.
- Clawd maps `overdue` to `notification` and `finishedDay` to `attention`; existing theme minimum-display behavior can delay lower-priority visual transitions briefly.
- Focused Super Productivity builder specs, local companion command specs, Clawd productivity route/state/menu/client tests, and `electron:build` passed after these changes.

## 2026-06-10 Phase 4 checkpoint

- Super Productivity accepts `quickAddTask` through `POST /companion-command` and creates the task via `TaskService.add(title, false)`, preserving the active work-context defaults owned by Super Productivity.
- Clawd command client sanitizes `quickAddTask` titles and sends them through the existing companion command path.
- Clawd tray and pet context menus expose `Quick Add Task from Clipboard`, enabled only when the clipboard has non-empty text.
- Clawd tray and pet context menus show a compact read-only day summary when Super Productivity publishes `day` data.
- Focused Super Productivity local REST specs and Clawd command/menu tests passed after these changes.

## 2026-06-10 bridge smoke checkpoint

- Added `clawd-on-desk/scripts/verify-super-productivity-companion.js` and the package script `npm.cmd run verify:super-productivity-companion`.
- The smoke test starts the real Clawd server module on a temporary local port with test runtime-config hooks.
- It posts a full Super Productivity productivity snapshot to `/productivity-state` and verifies the accepted Clawd response, server header, runtime port status, visual state mapping, current task, day summary data, and unsupported-schema rejection.
- It starts a fake Super Productivity `/companion-command` receiver and verifies that Clawd sends sanitized `openApp`, `pauseCurrentTask`, and `quickAddTask` commands while rejecting invalid commands locally.
- This does not replace the remaining visible two-app GUI verification, but it covers the cross-process HTTP contract in a repeatable automated check.

## 2026-06-10 Super Productivity main-process command checkpoint

- Added `super-productivity/electron/local-rest-api.test.cjs`.
- The test starts the real Electron main-process local REST server on `127.0.0.1:3876` when the port is available.
- It verifies `POST /companion-command` is rejected with `COMPANION_DISABLED` while the local REST API is enabled but desktop companion integration is disabled.
- It verifies enabling only desktop companion integration keeps broader local REST routes unavailable while allowing companion commands.
- It verifies companion command requests call the app focus path and are forwarded to the renderer through `LOCAL_REST_API_REQUEST`, with the renderer response returned to the HTTP client.

## 2026-06-10 integrated verification gate

- Added `scripts/verify-companion-integration.ps1` at the integrated project root.
- The gate checks the isolated GUI verification launcher's PowerShell syntax, then runs Clawd's companion bridge smoke test, Clawd's focused route/menu/command/state tests, Super Productivity Electron main-process tests, Super Productivity companion command handler specs, state builder specs, publisher specs, and `electron:build`.
- The gate passed locally on 2026-06-10 and is the preferred automated check before visible two-app GUI verification.

## 2026-06-10 isolated GUI verification launcher

- Added `scripts/start-companion-gui-verification.ps1` at the integrated project root.
- The launcher creates a temporary verification session with isolated `USERPROFILE`, `HOME`, `APPDATA`, `LOCALAPPDATA`, and a Super Productivity `--user-data-dir`.
- It starts the Super Productivity Angular dev server, Super Productivity Electron app, and Clawd in visible PowerShell windows that share the temporary home directory, so Clawd's `~/.clawd/runtime.json` and Super Productivity's runtime discovery stay inside the verification session.
- It writes a `manual-verification-checklist.md` and `pids.txt` into the temporary session root.
- The launcher checks that each child project has a complete Electron install before opening windows. This catches half-installed `node_modules/electron` directories where `electron.exe` is missing.
- PowerShell parser validation passed for the launcher script. The script is intended to make the remaining visible GUI verification safer by avoiding the user's real app data.
- Launcher smoke on 2026-06-10 created an isolated session and Clawd wrote `~/.clawd/runtime.json` with port `23334`; `GET /state` on that port returned `{ ok: true, app: "clawd-on-desk" }`. Super Productivity `/health` stayed unavailable until the desktop companion setting is enabled in the temporary profile, so the visible checklist still needs to be completed manually.
