# AGENTS.md — Re:SET

## Project overview
Re:SET is a local-first, Cover-centric DJ set planner built on the Traktor Pro 4 library.
Single-package app: Vite + React 19 + TypeScript + Tailwind CSS v4 SPA. A Tauri (Rust) shell
for Traktor write-back is planned but not yet present. Full spec in `PFLICHTENHEFT.md`; human
intro in `README.md`.

## Setup
- Node ≥ 20.
- Package manager is npm (a `package-lock.json` is committed).

```bash
npm install
```

Do not use pnpm or yarn. Do not add a dependency without first checking `package.json`; if a
needed package is missing, install it explicitly and commit the lockfile change.

## Build / test / typecheck

```bash
npm run dev        # Vite dev server on http://localhost:5173
npm run build      # production build (also the import/compile smoke test)
npm run typecheck  # tsc --noEmit
npm run preview    # serve the built bundle
```

No test runner and no linter are configured yet — do not invent commands for them.
Default verification before declaring a task done or committing:

```bash
npm run typecheck && npm run build
```

## Code style
- TypeScript strict mode (see `tsconfig.json`). ES modules only.
- React function components + hooks. Keep CPU-heavy/perpetual animation out of parent renders.
- Tailwind v4 utilities for ~90% of styling.
- Colors and fonts come ONLY from the design tokens in `src/index.css` (`@theme`). Do not write
  inline hex / `oklch()` / `rgb()` that bypass a token. Add a new named token, then reference it.
- Fonts: Geist Sans + Geist Mono only. Do not introduce Inter or serif fonts.
- Icons: `@phosphor-icons/react` only (weight `regular`/`bold`). No emojis anywhere.
- Source lives in `src/`: UI in `src/components/`, logic in `src/lib/`.
- The full design system (palette, typography, motion dials) is `PFLICHTENHEFT.md` §15–§16.

## Commit rules
- Commit only when the user explicitly asks.
- Small, focused commits. Imperative subject line; body explains what/why.
- End agent commits with: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- Branch off `main` for non-trivial work. No CI is configured; the default verification command
  above is the gate.

## Security & secrets
- Treat this file and the repo as public. No secrets, tokens, or private paths.
- Never read or write the user's real Traktor `collection.nml`. Operate only on a copy at
  `public/collection.sample.nml`.
- Future write-back (Tauri/Rust) MUST: back up `collection.nml` before writing, show a dry-run
  diff, write atomically, and never modify existing `<ENTRY>` track data — only add playlist nodes.
- The app makes no network calls and needs no auth. Do not add telemetry or external calls.
- Track metadata is rendered as React text (auto-escaped). Do not introduce
  `dangerouslySetInnerHTML`.

## Architecture notes
- Persistence is behind `src/lib/store/storage.ts` (localStorage today → SQLite/Tauri later).
  Keep the storage interface stable; do not scatter `localStorage` calls elsewhere.
- NML parsing is isolated in `src/lib/nml.ts`. Keep it defensive and version-tolerant
  (Traktor's `.nml` format is undocumented). Camelot logic lives in `src/lib/camelot.ts`,
  compatibility scoring in `src/lib/compat.ts`.
- The Tauri/Rust core (filesystem, NML write-back, backups) is not built yet; `cargo` is not
  installed. When added, put it under `src-tauri/` with its own `AGENTS.md`.

## Nested AGENTS.md
None yet. Add `src-tauri/AGENTS.md` (Rust/Tauri build & write-back safety) when that shell lands.
