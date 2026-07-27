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
pnpm db:migrate       # Run SQLite migrations
pnpm db:migrate-pg    # Migrate SQLite data to PostgreSQL
pnpm db:studio        # Open Drizzle Studio (visual DB inspector)
pnpm test             # Run Vitest test suite (API routes, middleware, server utils)
pnpm test:watch       # Run Vitest in watch mode
pnpm test:coverage    # Run tests with V8 coverage reporting
pnpm typecheck:test   # Type-check the test suite (test/tsconfig.json)
```

The project uses **Vitest** (`vitest` 4.x) with `@nuxt/test-utils` and `@vitest/coverage-v8`:

- Config: `vitest.config.ts` (node environment, `test/**/*.test.ts`, setup via `test/setup.ts`). Path aliases `#server`, `#db`, `#utils`, `#server/types` are mapped to `server/`.
- Tests cover API route handlers (`test/api/`), middleware (`test/middleware/`), and server utils (`test/utils/`). External services (TMDB, Prowlarr, qBittorrent, Jellyfin, Discord) are mocked; API handlers are invoked directly with a mocked `event`.
- `pnpm typecheck` runs `nuxt typecheck` plus `vue-tsc --noEmit -p test/tsconfig.json`.

See [docs/development.md](./docs/development.md#testing) for the full testing guide.

### Testing gotchas
- `test/setup.ts` stubs h3 globals so handlers run without a server: `defineEventHandler` is an identity stub, `readBody`/`getQuery` are mockable `vi.fn()`s.
- The stubbed `createError` THROWS a string `"<statusCode>: <statusMessage>"`, so assertions look like `await expect(handler(event)).rejects.toThrow('400: ...')`.
- Handlers are imported directly (e.g. `import handler from '#server/api/auth/login.post'`) and invoked with a mock `event` object; per-test globals (`useDb`, `getUserSession`, etc.) are stubbed with `vi.stubGlobal`.
- External services are always mocked (`vi.mock('@node-rs/bcrypt')`, `vi.mock('#server/utils/sync')`, etc.) - no network calls in tests.
- Put test files next to the code they cover, mirroring `server/` layout under `test/`. Type-check tests separately with `pnpm typecheck:test` (uses `test/tsconfig.json`).

## Environment Variables

StreamHub is configured entirely through env vars (see `.env.example`). Nuxt maps `NUXT_*` vars into `runtimeConfig` by lowercasing and stripping the prefix: `NUXT_TMDB_API_KEY` → `useRuntimeConfig().tmdbApiKey`, `NUXT_QBITTORRENT_URL` → `runtimeConfig.qbittorrentUrl`. Public vars need the `NUXT_PUBLIC_` prefix (e.g. `NUXT_PUBLIC_VAPID_PUBLIC_KEY`). `DB_DRIVER` (sqlite/postgres) selects the DB driver and is NOT a `NUXT_` var.

Required for a working instance: `NUXT_SESSION_PASSWORD`, `NUXT_TMDB_API_KEY`, `NUXT_PROWLARR_URL` + `NUXT_PROWLARR_API_KEY`, `NUXT_QBITTORRENT_URL` + `NUXT_QBITTORRENT_API_KEY`, `NUXT_TRACKER_ENCRYPTION_KEY`. Optional: Jellyfin, Redis, Discord webhook, FlareSolverr, VAPID keys, disk monitoring.

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
- Composables: `use` prefix + PascalCase file (e.g., `useReveal.ts`)
- Server utils: `kebab-case` (e.g., `browse-utils.ts`)
- Types/interfaces: `PascalCase` (e.g., `BrowseItem`, `SpotlightItem`)
- DB columns: `snake_case` (e.g., `daily_download_limit`)

### Server Utils Structure
```
server/utils/
├── *.ts              # Small utilities (auth, db, cache, format, logger, etc.)
├── clients/          # External service clients (jellyfin, qbittorrent, flaresolverr)
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
- Password order for Jellyfin sync: plain text to Jellyfin FIRST, then bcrypt for StreamHub

### Database
- Drizzle ORM with SQLite (default) or PostgreSQL
- Driver is chosen by the `DB_DRIVER` env var (`sqlite` or `postgres`)
- Schema in `server/database/schema.ts` - runtime resolver selects PG or SQLite based on `DB_DRIVER`
- Migrations in `server/database/migrations/`
- Run `pnpm dev` to auto-apply migrations (it runs `scripts/migrate.mjs` before `nuxt dev`)
- All timestamps stored as ISO 8601 text strings
- **Repository layer**: Use `getReposAsync()` to access typed repos (`server/repositories/`). Prefer repos over raw drizzle queries in new code. Tests should mock `#server/repositories` instead of direct db mocks.
- **DB access gotcha**: `useDb()` is SYNCHRONOUS and only works with SQLite. With `DB_DRIVER=postgres` it throws - use `getReposAsync()` (preferred) or `useDbAsync()` (returns a Promise).
- **Entity types**: All app-level types in `server/types/entities.ts` - never use raw DB column types in handlers.
- **Redis caching** (optional): `server/utils/cache.ts` uses `ioredis`. If `NUXT_REDIS_URL` is empty, `cacheGet`/`cacheSet` silently no-op. Used to cache TMDB/Prowlarr results.

### i18n
- Default locale is `en` (set in `nuxt.config.ts` `defaultLocale: 'en'`) - NOT Polish, despite what some docs prose claim.
- Five locales exist: `pl`, `en`, `de`, `fr`, `es` (files in `i18n/locales/`).
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
- `useReveal()` composable for scroll-triggered animations
- Use Nuxt UI 4 components (`UButton`, `UModal`, `USelect`, etc.)
- Overlay system: `useOverlay()` + `ConfirmDialog.vue`
