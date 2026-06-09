# CLAUDE.md

## Repository

This repo is the Claude on Desk Electron desktop app. It ships a Vite/React renderer, a TypeScript Electron main process, shared modules, extension assets, and vendored Node CLI bundles.

Use `AGENTS.md` as the canonical contributor guide. This file is a short Claude Code quick reference so future sessions start with the right habits.

## Day-to-Day Commands

- `npm run dev` starts the Electron app in development mode.
- `npm run dev:app` starts the Vite renderer only.
- `npm run build` runs TypeScript checks and builds production assets.
- `npm run build:vite` builds the renderer.
- `npm run typecheck` runs strict TypeScript checks without emitting files.
- `npm run lint` runs ESLint.
- `npm run format` formats the repository with Prettier.
- `npm run test:unit` runs Vitest once.
- `npm run test:unit -- --watch` runs Vitest in watch mode.
- `npm run test` runs Vitest, builds the app, and runs Playwright.

## Working Norms

- Prefer targeted edits in existing files; keep generated assets and vendored bundles untouched unless the task explicitly needs them.
- Use existing patterns in `src/main`, `src/shared`, and `src/components` before introducing new helpers or abstractions.
- Keep Electron main-process code cautious around subprocesses, environment variables, filesystem access, and proxy/session handling.
- Treat renderer code as user-facing UI: preserve accessibility, keyboard behavior, and platform-specific desktop expectations.
- Run the narrowest useful verification first, then broaden to `typecheck`, `lint`, or test suites when the change crosses module boundaries.

## Code Style

- TypeScript is strict; avoid `any` unless the local code already requires it.
- React components use PascalCase; hooks use `useX`; shared helpers use descriptive camelCase names.
- Follow the existing ESLint and Prettier rules rather than hand-formatting around them.
- Keep comments rare and focused on surprising constraints, not restating the code.

## Git Hygiene

- The worktree may contain user changes. Do not revert or clean files you did not touch unless the user explicitly asks.
- Stage and commit only when requested, and prefer staging explicit paths.
- Before PR or commit work, inspect `git status`, relevant diffs, and recent commit style.

## More Detail

See `AGENTS.md` for the full project layout, testing matrix, packaging notes, security guidance, and PR expectations.
