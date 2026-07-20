# Contributing to StreamHub

Thanks for your interest in improving StreamHub! This guide covers local setup, the development workflow, and how to open a pull request.

## Prerequisites

- Node.js 22+
- pnpm 11+
- Docker (optional, for the full stack)

## Local setup

```bash
git clone https://github.com/Nort1346/StreamHub.git
cd StreamHub
pnpm install
cp .env.example .env   # fill in your API keys
pnpm dev               # runs migrations, then starts on http://localhost:5757
```

For the full Docker stack (qBittorrent, Prowlarr, Jellyfin, etc.) see
[docs/getting-started.md](./docs/getting-started.md) and the `setup.sh` / `setup.ps1` scripts.

## Development workflow

1. Create a feature branch from `main`: `git checkout -b feat/my-change`.
2. Make your change. Follow the conventions in [AGENTS.md](./AGENTS.md):
   - No semicolons, single quotes, 2-space indent (Prettier).
   - All types in dedicated `types.ts` files — never inline.
   - No `any`; use `unknown` and narrow with type guards.
   - Server code uses `#server`, `#db`, `#utils` path aliases.
3. Keep the test suite green and add tests for new behavior:

   ```bash
   pnpm lint          # ESLint (strict TypeScript)
   pnpm typecheck     # nuxt typecheck + test types
   pnpm test          # Vitest suite
   pnpm format:check  # Prettier
   ```

4. Commit with a clear, imperative message (see existing history).
5. Open a pull request against `main` with a description of the change and the motivation.

## Tests

- Tests live under `test/`, mirroring the `server/` layout.
- External services (TMDB, Prowlarr, qBittorrent, Jellyfin, Discord) are mocked — no network calls.
- Run a focused file with `pnpm test path/to/file.test.ts`.

## Reporting issues

Use the issue templates. For security concerns, follow [SECURITY.md](./SECURITY.md) instead of opening a public issue.
