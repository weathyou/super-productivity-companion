# CLAUDE.md

Guidance for Claude Code working in this repository. Super Productivity is a todo and time-tracking app on Angular + Electron + Capacitor.

## Required reading per task

- Styling changes → [`docs/styling-guide.md`](docs/styling-guide.md)
- User-facing functionality changes → [`docs/documentation-guide.md`](docs/documentation-guide.md)
- Sync, op-log, vector clocks → [`docs/sync-and-op-log/`](docs/sync-and-op-log/)
- Effects/reducers/bulk-dispatch touching synced state → [`docs/sync-and-op-log/contributor-sync-model.md`](docs/sync-and-op-log/contributor-sync-model.md)
- E2E tests → [`e2e/CLAUDE.md`](e2e/CLAUDE.md)
- Load-bearing decisions → [`ARCHITECTURE-DECISIONS.md`](ARCHITECTURE-DECISIONS.md)

## Core commands

**ALWAYS run `npm run checkFile <filepath>` on every `.ts` or `.scss` file you modify** before reporting work as done.

```bash
npm run checkFile <filepath>   # prettier + lint a single file
npm run prettier               # multi-file format
npm run lint                   # multi-file lint
npm test                       # all unit tests (Jasmine/Karma, .spec.ts co-located)
npm run test:file <filepath>   # single spec
npm run e2e                    # all E2E (Playwright, slow)
npm run e2e:file <path> -- --retries=0   # single E2E (~20s/test); add --grep "name" for one test
npm start                      # Electron dev
ng serve                       # web dev (or npm run startFrontend)
npm run dist                   # production build (all platforms available locally)
```

For SuperSync E2E (docker-compose) and the full E2E reference, see [`e2e/CLAUDE.md`](e2e/CLAUDE.md).

## Repository map

- `src/app/features/` holds user-facing app domains such as tasks, projects, tags, schedule, worklog, reminders, plugins, and sync-related UI.
- `src/app/ui/` holds reusable presentation components, Formly integrations, pipes, and small UI utilities. Treat these as shared surface area.
- `src/app/core/` holds app-wide services and platform integrations such as persistence, startup, notifications, Electron/browser bridges, language, and date handling.
- `src/app/root-store/` holds NgRx root state, feature-store registration, and meta-reducers.
- `src/app/util/` holds shared pure utilities, tokens, and lower-level helpers used across features.
- `src/app/core-ui/`, `src/app/pages/`, `src/app/routes/`, and top-level `app.*` files compose the shell, navigation, and route-level behavior.
- `src/app/pfapi/`, `src/app/plugins/`, and `packages/plugin-*` cover the plugin API, bundled/community plugins, and plugin development tooling.
- `packages/sync-core/`, `packages/sync-providers/`, `packages/shared-schema/`, and `packages/super-sync-server/` contain the sync engine, provider adapters, shared validation/schema code, and server-side sync pieces.
- `electron/`, `android/`, and `ios/` contain platform wrappers; gate platform-specific runtime calls from app code.
- `e2e/` contains Playwright tests, fixtures, page objects, and its own Claude guidance.

## Task orientation

- Follow the existing domain folder first. For example, task behavior belongs under `src/app/features/tasks/` unless the current code already routes it through root-store meta-reducers or shared utilities.
- Prefer shared `src/app/ui/` components and existing Angular Material patterns before adding local markup or styling in a feature.
- Keep feature state changes close to the relevant store/actions/selectors; only touch `root-store/meta/` when a single user intent must update multiple entities atomically.
- For date, day-boundary, schedule, reminder, or worklog changes, inspect `DateService` and existing logical-day helpers before adding raw `Date` logic.
- For plugin work, remember that package builds copy plugin assets into `src/assets/`; verify both the package side and the app consumption side when behavior crosses that boundary.
- For Electron, mobile, and browser behavior, check the platform wrapper/service first and avoid leaking platform checks into unrelated feature code.
- For E2E work, use page objects and assertion helpers from `e2e/pages/`, `e2e/fixtures/`, and `e2e/utils/`; add raw locators only when no helper exists yet.

## Project rules

- **Translations:** UI strings go through `T` / `TranslateService`. Edit only `en.json`; never other locales.
- **Privacy:** no analytics or tracking — user data stays local unless explicitly synced.
- **Electron:** check `IS_ELECTRON` before using Electron-specific APIs.
- **Templates:** plain HTML, minimal CSS/classes, Angular Material sparingly. See [`docs/styling-guide.md`](docs/styling-guide.md).
- **Styling review:** do not locally restyle Angular Material or shared `src/app/ui/` components for one-off context needs. This includes overriding button styles via `.mat-*`, `.mdc-*`, `button[mat-*]`, or component internals in local SCSS. Prefer existing inputs/classes/tokens; if a variant must exist, make it reusable or add it to the shared style layer.
- **Strict TypeScript:** no `any` (use `unknown` if truly unknown).
- **State:** never mutate NgRx state — return new objects in reducers. Prefer Signals to Observables.
- **Tests:** add unit tests for new services and state logic.

## Sync-correctness rules

Touched on most state-related PRs. Read the linked source/doc for full reasoning before editing. Rules 1–3 and 6 are one invariant — *one user intent = one op; replayed/remote ops must not re-trigger effects* — fully explained in [`docs/sync-and-op-log/contributor-sync-model.md`](docs/sync-and-op-log/contributor-sync-model.md).

1. **Effects inject `LOCAL_ACTIONS`**, never `Actions` (`ALL_ACTIONS` only for the op-log capture effect; remote archive side effects → `ArchiveOperationHandler`, not `ALL_ACTIONS`). Lint-enforced (`no-actions-in-effects`). → [contributor-sync-model.md](docs/sync-and-op-log/contributor-sync-model.md), `src/app/util/local-actions.token.ts`.
2. **Prefer action-based effects**; a selector-based effect needs `skipDuringSyncWindow()`. Lint-enforced (`require-hydration-guard`). → [contributor-sync-model.md](docs/sync-and-op-log/contributor-sync-model.md).
3. **Multi-entity change = meta-reducer**, not an effect fan-out (one reducer pass = one op). → [contributor-sync-model.md](docs/sync-and-op-log/contributor-sync-model.md), `src/app/root-store/meta/task-shared-meta-reducers/`.
4. **Logical clock:** route "what day is this?" through `DateService` (`getLogicalTodayDate`, `isToday`, `todayStr`). Pure reducers/selectors take `startOfNextDayDiffMs` as an arg and call `isTodayWithOffset` for replay determinism. The raw `DateService.startOfNextDayDiff` is `private`; use `getStartOfNextDayDiffMs()` at service boundaries.
5. **`TODAY_TAG` (`'TODAY'`) is virtual** — never add to `task.tagIds`; membership comes from `task.dueWithTime` or `task.dueDay`. `TODAY_TAG.taskIds` only stores ordering. → `ARCHITECTURE-DECISIONS.md` Decision #2.
6. **Bulk dispatch loop:** `await new Promise(r => setTimeout(r, 0))` after the loop (else 50+ rapid dispatches lose state). → [contributor-sync-model.md](docs/sync-and-op-log/contributor-sync-model.md), `OperationApplierService.applyOperations()`.
7. **`SYNC_IMPORT` / `BACKUP_IMPORT`** replace state and intentionally drop concurrent ops (CONCURRENT or LESS_THAN by vector clock) — by design, not a bug. → `SyncImportFilterService`.
8. **Vector clocks:** `MAX_VECTOR_CLOCK_SIZE = 20`. Server prunes after conflict detection, before storage. → `docs/sync-and-op-log/vector-clocks.md`.
9. **Logging:** `Log.log({ id: task.id })`, never `Log.log(task)` or `Log.log(title)` — log history is exportable, never log user content.

## Commit messages

Angular format `type(scope): description`. Types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`. Examples: `feat(tasks): add recurring task support`, `fix(sync): handle network timeout`. **Never** `fix(test):` or `fix(e2e):` — test changes use `test:`.

## Anti-patterns

| Avoid                                                                      | Do instead                               |
| -------------------------------------------------------------------------- | ---------------------------------------- |
| `any` type                                                                 | proper types, `unknown` if truly unknown |
| Direct DOM access                                                          | Angular bindings, `viewChild()`          |
| Side effects in constructors                                               | `async` pipe or `toSignal`               |
| Subscribing without cleanup                                                | `takeUntilDestroyed()` or async pipe     |
| `NgModules` for new code                                                   | standalone components                    |
| Re-declaring Material theme styles                                         | existing theme variables                 |
| One-off `.mat-*`, `.mdc-*`, `button[mat-*]`, or shared component overrides | reusable inputs, tokens, or shared styles |
