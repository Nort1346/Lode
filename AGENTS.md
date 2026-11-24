# AGENTS.md

## Build / Lint / Test Commands

```bash
pnpm dev              # Dev server (runs migrations first, then starts on port 5757)
pnpm build            # Production build
pnpm preview          # Preview production build
pnpm lint             # ESLint check (strict TypeScript)
pnpm lint:fix         # ESLint auto-fix
pnpm format           # Prettier format
pnpm format:check     # Prettier check (CI-friendly)
pnpm typecheck        # Nuxt type checking (vue-tsc)
pnpm db:generate      # Generate Drizzle migration files
pnpm db:migrate       # Run DB migrations (SQLite or PostgreSQL via DB_DRIVER)
pnpm db:studio        # Open Drizzle Studio (visual DB inspector)
pnpm test             # Run Vitest test suite (API routes, middleware, server utils)
pnpm test:watch       # Run Vitest in watch mode
pnpm test:coverage    # Run tests with V8 coverage reporting
pnpm test:e2e         # Playwright E2E suite (isolated SQLite, mock TMDB, port 5758)
pnpm typecheck:test   # Type-check the test suite (test/tsconfig.json)
pnpm typecheck:e2e    # Type-check e2e/tsconfig.json
pnpm exec vitest run -c vitest.db-parity.config.ts  # SQLite/PostgreSQL parity PoC
```

## The `cli/` project (standalone)

`cli/` is the setup CLI (the `lode-setup` binary): a TypeScript + @clack/prompts app that holds all installer logic. The root `setup.sh` / `setup.ps1` are thin bootstraps that try `releases/latest/download/<asset>` first and exec the prebuilt binary. When that download fails (newest release without binaries yet, CDN race, broken transfer), they walk the releases API newest-first and try every non-prerelease release whose assets include the binary. Cached binaries are reused, and `GH_TOKEN` / `GITHUB_TOKEN` lifts the API rate limit.

The installer is a 17-step pipeline (`TOTAL_STEPS = 17`). Step 8 is `configureStaging()`, which offers download staging, creates `media/downloads/movies` and `media/downloads/series`, and writes `NUXT_DOWNLOAD_PATH_MOVIES` / `NUXT_DOWNLOAD_PATH_SERIES` to `.env` (skipping the step removes them).

- **Standalone project**: its own `package.json`, `bun.lock`, `tsconfig.json`, `eslint.config.mjs`, `vitest.config.ts`, and a `pnpm-workspace.yaml` (`packages: []`) that keeps it out of the root workspace. Root `pnpm` commands don't touch it, and root ESLint ignores `cli/**`.
- **Runtime tooling is Bun**: `bun install`, `bun run typecheck|lint|test`; release binaries are built with `bun build --compile --target=bun-<os>-<arch>` (see `.github/workflows/cli.yml`).
- **Commands** (run from `cli/`): `bun install`, `bun run typecheck`, `bun run lint`, `bun run test` (Vitest, `test/**/*.test.ts` mirrors `src/`).
- **CI**: `cli.yml` runs check on PRs/pushes touching `cli/**` and, on `v*` tags, builds 6 platform binaries and uploads them to the same GitHub release that `docker.yml` creates.
- Details: [cli/AGENTS.md](./cli/AGENTS.md)

## Commit Messages

Use **Conventional Commits** format:

```
<type>(<scope>): <short description>
```

- Types: `feat`, `fix`, `refactor`, `chore`, `docs`, `ci`, `test`, `style`
- Scope is optional but encouraged (e.g. `setup`, `docker`, `ui`, `api`)
- Keep description concise and in English
- No "Priority" labels or unnecessary prefixes
- **Do NOT commit yourself** - only provide the commit message for the user to run

Examples:
```
feat(setup): add dev hero screenshot mode with TMDB ID override
fix(setup): download .env.example from GitHub when running standalone
refactor: organize server/utils into subdirectories
chore: disable nuxt devtools and add migrations to preview script
```

The project uses **Vitest** (`vitest` 5.x) with `@nuxt/test-utils` and `@vitest/coverage-v8`:

- Config: `vitest.config.ts` (node environment, `test/**/*.test.ts`, setup via `test/setup.ts`). Path aliases `#server`, `#db`, `#utils`, `#server/types` are mapped to `server/`; `#shared` maps to `shared/`.
- Tests cover API route handlers (`test/api/`), middleware (`test/middleware/`), server utils (`test/utils/`), app composables (`test/app/`), shared modules (`test/shared/`), i18n key parity (`test/i18n/`), `e2e/tests/` (Playwright specs: auth, admin users, browse, requests, smoke, document titles), and `test/db-parity/` (cross/schema parity + driver CRUD probes). External services (TMDB, Prowlarr, qBittorrent, Jellyfin, Discord) are mocked; API handlers are invoked directly with a mocked `event`.
- The E2E suite wipes `.data-e2e`, seeds `e2e-admin`/`e2e-user`, starts a mock TMDB server and the app on port 5758 with no Prowlarr/qBittorrent/Jellyfin/Redis/Discord; see CI workflows `.github/workflows/e2e.yml` and `.github/workflows/db-parity.yml`.
- `pnpm typecheck` runs `nuxt typecheck` plus `vue-tsc --noEmit -p test/tsconfig.json` and `vue-tsc --noEmit -p e2e/tsconfig.json`.

See [docs/development.md](./docs/development.md#testing) for the full testing guide.

### Testing gotchas
- `test/setup.ts` stubs h3 globals so handlers run without a server: `defineEventHandler` is an identity stub, `readBody`/`getQuery` are mockable `vi.fn()`s.
- The stubbed `createError` THROWS a string `"<statusCode>: <statusMessage>"`, so assertions look like `await expect(handler(event)).rejects.toThrow('400: ...')`.
- Handlers are imported directly (e.g. `import handler from '#server/api/auth/login.post'`) and invoked with a mock `event` object; per-test globals (`useDb`, `getUserSession`, etc.) are stubbed with `vi.stubGlobal`.
- External services are always mocked (`vi.mock('@node-rs/bcrypt')`, `vi.mock('#server/utils/sync')`, etc.) - no network calls in tests.
- Put test files next to the code they cover, mirroring `server/` layout under `test/`. Type-check tests separately with `pnpm typecheck:test` (uses `test/tsconfig.json`).

## Pre-commit hooks

The repo uses **husky** + **gitleaks**: `pnpm install` runs `husky` (via the `prepare` script), wiring `.husky/pre-commit` and `.husky/pre-push` into git.

- **pre-commit** scans only the staged changes (`gitleaks git --staged`) and is **blocked** if a secret is found - fast, runs on every commit
- **pre-push** scans the full git history (`gitleaks git`) as a local backstop
- A weekly full-history gitleaks scan also runs in CI (`.github/workflows/gitleaks.yml`)
- The **gitleaks binary is required locally** - the hooks fail with an install hint if it is missing:
  - Windows: `winget install Gitleaks.Gitleaks`
  - macOS: `brew install gitleaks`
  - Linux: https://github.com/gitleaks/gitleaks#installing
- Do not commit secrets - if one ever leaks, rotate it; rewriting history does not un-leak it

## Environment Variables

Lode is configured entirely through env vars (see `.env.example`). Nuxt maps `NUXT_*` vars into `runtimeConfig` by lowercasing and stripping the prefix: `NUXT_TMDB_API_KEY` → `useRuntimeConfig().tmdbApiKey`, `NUXT_QBITTORRENT_URL` → `runtimeConfig.qbittorrentUrl`. Public vars need the `NUXT_PUBLIC_` prefix (e.g. `NUXT_PUBLIC_VAPID_PUBLIC_KEY`). `DB_DRIVER` (sqlite/postgres) selects the DB driver and is NOT a `NUXT_` var.

Required for a working instance: `NUXT_APP_SECRET`, `NUXT_PROWLARR_URL` + `NUXT_PROWLARR_API_KEY`, `NUXT_QBITTORRENT_URL` + `NUXT_QBITTORRENT_API_KEY`, `NUXT_TRACKER_ENCRYPTION_KEY`. Optional: `NUXT_TMDB_API_KEY` (Lode falls back to its built-in public shared key - `BUILTIN_TMDB_API_KEY` in `server/utils/tmdb.ts`, intentionally shipped and allowlisted in `.gitleaks.toml`/`trivy-secret.yaml`), Jellyfin, Redis, Discord webhook, FlareSolverr, VAPID keys, disk monitoring.

`NUXT_SESSION_PASSWORD` is a deprecated fallback for `NUXT_APP_SECRET`: `scripts/start.mjs` maps it at runtime and logs a warning (if both are set, the old value is ignored); `nuxt dev` aliases it only in dev. Users are logged out once after upgrading to nuxt-auth-utils 0.6 because the cookie name/format changed. Two more optional vars exist for testing: `NUXT_TMDB_BASE_URL` (a TMDB-compatible base URL, used by the E2E mock) and `DB_DATA_DIR` (relocates the SQLite data dir, used by E2E).

## Docker Requirements

- **Memory**: Docker Desktop must have **≥4GB memory** allocated (Settings > Resources > Memory). Recommended: 6GB.
- The Nuxt/Nitro production build requires at least 2GB for Node.js plus overhead for Docker and the OS.

## Code Style

### Formatting (Prettier)
- No semicolons
- Single quotes
- No trailing commas
- 120 char print width
- 2-space indent
- Use `-` (hyphen) for list items, NOT `—` (em dash) — em dashes look AI-generated

### Comments
- Prefer self-explanatory code over comments - do not narrate what the next line already says
- Add a comment only when the *why* is non-obvious: workarounds, subtle invariants, external-service quirks, or intentional trade-offs
- Do not add JSDoc or doc blocks to every function or obvious helper; keep them for public APIs where they add real information
- Do not add placeholder `TODO`s or step-by-step annotations unless they capture a genuine, actionable constraint

### ESLint Rules
- **Strict TypeScript** via `projectService: true` (full type-aware linting)
- `no-explicit-any: error` - never use `any`
- `no-unsafe-*: error` - no unsafe assignment/member-access/return/call/argument
- `no-floating-promises: error` - always handle promises
- `no-misused-promises: error` - no async in non-async contexts
- `await-thenable: error` - only await thenables
- `strict-boolean-expressions: warn`
- `eqeqeq: always` - strict equality only
- `no-non-null-assertion: error`
- `consistent-type-assertions: error`
- `require-array-sort-compare: error` (server only)
- Unused vars: warning (prefix with `_` to ignore: `^_` pattern)
- Server files: `no-console: off` | App files: `no-console: warn`

### Path Aliases
```ts
import { something } from '#server'   // → ./server
import { schema } from '#db'          // → ./server/database
import { helper } from '#utils'       // → ./server/utils
```

### Imports
- Use `#server/`, `#db/`, `#utils/` path aliases (NOT relative paths for server code)
- Vue components imported automatically via Nuxt auto-import
- Composables auto-imported from `app/composables/`
- Server utils auto-imported from `server/utils/` (including subdirectories: `clients/`, `torrents/`, `notifications/`, `sync/`)

### Types
- **All types MUST be in separate `types.ts` files** - never inline in implementation files
- Server types: `server/types/*.ts`
- App types: `app/types/*.ts`
- Shared types: `shared/*.d.ts`
- Use `interface` for object shapes, `type` for unions/intersections
- No `any` - ever. Use `unknown` and narrow with type guards

### Constants
- Use the `SETTINGS` constant system for settings keys (`server/types/settings.ts`)
- Using an invalid key is a TypeScript compile error - this is intentional
- Never use magic strings/numbers for settings keys

### Naming Conventions
- API route files: `kebab-case` (e.g., `browse/download.post.ts`)
- Vue components: `PascalCase` (e.g., `MediaCard.vue`)
- Composables: `use` prefix + PascalCase file (e.g., `useDownloadOverlay.ts`)
- Server utils: `kebab-case` (e.g., `browse-utils.ts`)
- Types/interfaces: `PascalCase` (e.g., `BrowseItem`, `SpotlightItem`)
- DB columns: `snake_case` (e.g., `daily_download_limit`)

### Server Utils Structure
```
server/utils/
├── *.ts              # Small utilities (auth, db, cache, format, logger, etc.)
├── clients/          # External service clients (jellyfin, qbittorrent, flaresolverr)
├── library/          # Media organization (importer.ts, media-settings.ts, organize.ts, organize-completed.ts)
├── torrents/         # Torrent handling (ranking, sync, safe-download)
├── notifications/    # Notifications (notifications, discord, push, sse-hubs)
└── sync/             # User sync subsystem (with providers/)
```

### Error Handling
- API errors: `createError({ statusCode, statusMessage })`
- Try/catch external calls (TMDB, Prowlarr, Jellyfin, qBittorrent)
- Log errors with `createLogger('ModuleName')` - never `console.log` in app code
- **Server code must NEVER use `console.log/warn/error`** - always use `createLogger()` which sends logs to the SSE ring buffer. Import: `import { createLogger } from '#server/utils/logger'`
- Admin bypass does NOT apply to disk space checks
- User creation: local DB insert FIRST, then external sync (prevents orphans)

### Authentication
- Cookie-based sessions via `nuxt-auth-utils`
- Session cookie `secure: false` for HTTP dev access
- Session validation middleware on every `/api/` request
- Middleware checks `is_active` - disabled users get session cleared + 401
- `requireUser()` queries DB for fresh user data (not stale cookie) - fixes role staleness
- Password order for Jellyfin sync: plain text to Jellyfin FIRST, then bcrypt for Lode

### Database
- Drizzle ORM with SQLite (default) or PostgreSQL
- Driver is chosen by the `DB_DRIVER` env var (`sqlite` or `postgres`)
- Schema in `server/database/schema.ts` - runtime resolver selects PG or SQLite based on `DB_DRIVER`
- Migrations in `server/database/migrations/` (SQLite) and `server/database/migrations/postgres/` (PostgreSQL)
- Run `pnpm dev` to auto-apply migrations (it runs `scripts/migrate.mjs` before `nuxt dev`)
- All timestamps stored as ISO 8601 text strings
- **Repository layer**: Use `getReposAsync()` to access typed repos (`server/repositories/`). Prefer repos over raw drizzle queries in new code. Tests should mock `#server/repositories` instead of direct db mocks.
- **DB access gotcha**: `useDb()` is SYNCHRONOUS and only works with SQLite. With `DB_DRIVER=postgres` it throws - use `getReposAsync()` (preferred) or `useDbAsync()` (returns a Promise).
- **Entity types**: All app-level types in `server/types/entities.ts` - never use raw DB column types in handlers.
- **Redis caching** (optional): `server/utils/cache.ts` uses `ioredis`. If `NUXT_REDIS_URL` is empty, `cacheGet`/`cacheSet` silently no-op. Used to cache TMDB/Prowlarr results.

### i18n
- Default locale is `en` (set in `nuxt.config.ts` `defaultLocale: 'en'`) - NOT Polish, despite what some docs prose claim.
- Six locales exist: `pl`, `en`, `de`, `fr`, `es`, `pt-BR` (files in `i18n/locales/`).
- Polish translations MUST still be in Polish - no English fallbacks for the `pl` locale.
- Use `t('key')` from `useI18n()` in Vue, `useI18nServer()` in server code
- When changing locale: `setLocale($event)` - NOT `locale.value = $event`
- No Google Translate - all translations are manually written
- UI strings: no hardcoded text, always through i18n keys
- The locale is passed as a `locale` query param to all `/api/browse/*` endpoints for TMDB localization

### Vue / Component Patterns
- `<script setup lang="ts">` - always use script setup with TypeScript
- `useFetch` / `$fetch` for API calls from Vue components
- Server API route handlers do NOT call other routes over HTTP - they import and call server utils (e.g. `useDb()`, `getUserSession()`) directly. There is no `eventFetch` helper.
- `v-reveal` directive for scroll-triggered animations (registered in `plugins/directives.ts`)
- Use Nuxt UI 4 components (`UButton`, `UModal`, `USelect`, etc.)
- Overlay system: `useOverlay()` + `ConfirmDialog.vue`
- Each page sets its document title via reactive `useSeoMeta({ title: () => ... })` using the `seo.title` suffix; detail pages use the loaded item name; `error.vue` follows the same pattern.
- Use `useThemeToggle()` instead of raw `useColorMode()` in components to avoid hydration mismatch (theme resolves after mount).
