# CLAUDE.md

This project's agent instructions live in [AGENTS.md](AGENTS.md) — the canonical, vendor-neutral
file. Read it first.

Claude-Code-specific note: the default verification before completing a task is
`npm run typecheck && npm run build`. Commit only when the user explicitly asks.
