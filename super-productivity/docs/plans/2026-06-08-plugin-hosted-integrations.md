# Plugin-Hosted Integrations

**Date:** 2026-06-08
**Status:** Draft design
**Scope:** Integration architecture and migration plan. No runtime code changes in this document.

## Context

Super Productivity already has first-party integrations for Jira, GitHub, GitLab, OpenProject, Gitea, Redmine, CalDAV, Google Calendar, and local files. The current model keeps those integrations inside the app codebase, which gives them full access to app internals but also couples integration maintenance to core releases.

The goal is to let integrations live as plugins while preserving the current user-facing integration capabilities and sync correctness rules. This is not a rewrite of every integration into arbitrary third-party code. It is an extraction path: core keeps the stable UI surfaces, persistence boundaries, sync capture, and security-sensitive capabilities; plugins provide provider-specific protocol logic and optional settings/task metadata extensions through constrained APIs.

This plan is separate from [`2026-06-09-desktop-companion-integration.md`](2026-06-09-desktop-companion-integration.md). The desktop companion plan covers integrating the Clawd desktop pet runtime with Super Productivity's task/time state. This document only covers provider-style integrations such as issue trackers, calendars, and file sync.

## Target model

Core owns the integration shell:

- Integration discovery and enable/disable state.
- Settings screen layout, validation flow, and permission prompts.
- Storage, encryption boundary, sync capture, import/export behavior, and backup handling.
- Task linking UI and common task metadata presentation.
- Scheduling/background execution policy.
- Error reporting patterns and retry/backoff policy.

Plugins own provider-specific behavior:

- OAuth/token or credential exchange steps delegated through core capabilities.
- Remote issue/event/file fetch, push, and mapping logic.
- Provider-specific settings fields declared through a schema.
- Provider-specific task link metadata and commands.
- Optional sync actions exposed through a typed integration adapter.

The app should feel unchanged to users: an integration still appears as a native integration, not as a separate plugin mini-app.

## Non-goals

- Do not expose arbitrary NgRx store access to plugins.
- Do not let plugins render full custom settings screens for integrations.
- Do not move credential storage into plugin-owned storage.
- Do not allow plugins to dispatch task mutations directly.
- Do not require existing users to recreate integration settings.
- Do not make plugin execution part of op-log replay.

## Proposed API shape

Add a typed integration registration API to the plugin bridge:

```typescript
interface PluginIntegrationDefinition {
  id: string;
  type: 'issue-provider' | 'calendar-provider' | 'file-sync-provider';
  label: string;
  icon?: string;
  settingsSchema: PluginIntegrationSettingsSchema;
  capabilities: PluginIntegrationCapability[];
}

interface PluginIntegrationAdapter<TSettings> {
  testConnection(settings: TSettings): Promise<PluginIntegrationConnectionResult>;
  fetchRemoteItems(context: PluginIntegrationContext<TSettings>): Promise<PluginRemoteItem[]>;
  pushLocalChanges?(context: PluginIntegrationContext<TSettings>, changes: PluginLocalChange[]): Promise<PluginPushResult>;
  dispose?(): void;
}
```

The exact type names can change during implementation, but the important boundary is stable: plugins register a definition plus adapter callbacks; core invokes those callbacks from existing app-owned orchestration.

## Core bridge services

### Integration registry

Create an app-owned registry that receives plugin integration definitions and exposes them alongside built-in integrations. It should validate ids, reject duplicates, track plugin ownership, and unregister definitions when a plugin unloads.

### Settings schema renderer

Use schema-declared fields for provider-specific settings while keeping the containing settings UI in core. The schema should support the field types integrations already need: text, password/token, URL, checkbox, select, and readonly help/link text.

Validation belongs in two layers:

- Synchronous schema validation in core for field shape and required values.
- Provider validation via `testConnection()` for credentials, server URL, and remote permissions.

### Credential capability

Plugins should request credentials through a core capability rather than reading or writing secrets directly. Core stores secrets using the same secure storage and backup/export rules as existing integrations.

### Task-link capability

Plugins can declare provider-specific task links and commands, but task mutations must flow through core-owned commands. This keeps op-log capture and sync replay behavior under the same rules as first-party task changes.

### Background execution capability

Core controls when integration work runs. Plugins provide callbacks; core schedules them according to existing sync/polling behavior, app lifecycle, network state, and user settings.

## Migration strategy

### Phase 1: Build the host contract

Implement the plugin integration registry, schema renderer, credential capability, and adapter invocation service without moving any existing integration. Add a small internal fixture plugin or test-only plugin registration to prove lifecycle behavior.

Verification:

- Unit tests for registration, duplicate ids, unregister-on-plugin-unload, and schema validation.
- Unit tests proving credentials are not stored in plugin-owned synced data.
- Tests showing plugin callbacks cannot dispatch task mutations directly.

### Phase 2: Move one low-risk provider

Use a narrow provider as the first real migration. Prefer an issue-provider integration with smaller surface area over calendar or file sync, because calendars and file sync have higher data-loss and scheduling risk.

Candidate criteria:

- Minimal credential model.
- No complex two-way conflict behavior.
- Existing integration test coverage or easy-to-add coverage.
- Clear mapping between remote item and local task link metadata.

Verification:

- Existing settings migrate without user action.
- Connection test, import/update, task linking, and error states behave the same as before.
- `npm run checkFile` for touched TypeScript/SCSS files.
- Focused unit tests for the migrated provider.

### Phase 3: Extract issue providers behind the same adapter

After the first provider proves the shape, migrate the remaining issue providers one at a time. Keep shared provider utilities in core only when they represent app invariants; move provider protocol code into plugin packages.

Expected candidates:

- GitHub
- GitLab
- Jira
- OpenProject
- Gitea
- Redmine

Each migration should include a compatibility shim only for data migration, not a permanent duplicate runtime path.

### Phase 4: Reassess calendar and file sync

Calendar and file sync should not move until the issue-provider adapter is stable. They likely need separate adapter types because their correctness constraints differ:

- Calendar providers need recurrence, deletion, time-zone, and background refresh semantics.
- File sync providers touch the sync engine and must preserve data-loss protections.

Treat these as separate designs instead of forcing them through the issue-provider API.

## Data migration

Existing integration settings should be migrated from their current storage location into core-owned plugin integration settings. Use stable integration ids that match the old provider identity where possible.

Migration requirements:

- Preserve enabled/disabled state.
- Preserve credential references without exposing secret values to plugin code.
- Preserve task metadata links.
- Be idempotent across app restarts.
- Leave enough version metadata to distinguish migrated settings from newly created plugin settings.

## Security constraints

- Plugin code must never receive raw secret values unless the user explicitly enters them for the current connection flow and the value is needed to complete that flow.
- Core should prefer capability handles over raw tokens.
- Plugin network access should be scoped to declared provider origins when feasible.
- Settings schemas must not allow arbitrary HTML.
- Plugin errors shown in the UI should avoid leaking credentials, task titles, or remote payload bodies.

## Sync correctness constraints

Plugin-hosted integrations must still obey the existing sync model:

- One user intent should still produce one operation.
- Remote/replayed operations must not trigger integration side effects.
- Plugin callbacks must not run while op-log replay is applying remote operations.
- Multi-entity task mutations should remain core-owned meta-reducer work, not plugin dispatch loops.

The plugin host should expose commands that represent user intent rather than allowing low-level action dispatch. This keeps integrations compatible with `docs/sync-and-op-log/contributor-sync-model.md`.

## Testing strategy

Add tests at three layers:

- Registry and bridge unit tests for plugin lifecycle, schema validation, and capability restrictions.
- Integration adapter tests for each migrated provider.
- E2E coverage for one migrated provider's settings, connection test, import/update flow, and task-link UI.

For providers that require external services, use existing mock/test-server patterns where available instead of relying on live third-party accounts.

## Rollout plan

1. Ship the host contract hidden from users.
2. Migrate one provider behind the plugin host while preserving the same visible settings entry.
3. Keep telemetry-free local diagnostics through existing logging rules only.
4. Migrate remaining issue providers after the first provider has run through at least one release cycle.
5. Revisit calendar and file sync with separate designs.

## Open questions

- Which existing issue provider has the smallest real migration surface?
- Should bundled first-party integration plugins live under `packages/plugin-*`, `src/assets`, or a new first-party plugin package group?
- How should plugin origin/network restrictions be represented on desktop, web, and mobile?
- Do we need a generic integration test harness that can run the same contract tests against built-in and plugin-hosted providers?
