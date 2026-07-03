# AGENTS.md

## Build / Lint / Test Commands

```bash
pnpm dev              # Dev server (runs migrations first, then starts on port 3000)
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
```

There are **no test files or test framework** in this project. If you write tests, use whatever framework is added (check package.json first).

## Code Style

### Formatting (Prettier)
- No semicolons
- Single quotes
- No trailing commas
- 120 char print width
- 2-space indent

### ESLint Rules
- **Strict TypeScript** via `projectService: true` (full type-aware linting)
- `no-explicit-any: error` — never use `any`
- `no-unsafe-*: error` — no unsafe assignment/member-access/return/call/argument
- `no-floating-promises: error` — always handle promises
- `no-misused-promises: error` — no async in non-async contexts
- `await-thenable: error` — only await thenables
- `strict-boolean-expressions: warn`
- `eqeqeq: always` — strict equality only
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
- Server utils auto-imported from `server/utils/`

### Types
- **All types MUST be in separate `types.ts` files** — never inline in implementation files
- Server types: `server/types/*.ts`
- App types: `app/types/*.ts`
- Shared types: `shared/*.d.ts`
- Use `interface` for object shapes, `type` for unions/intersections
- No `any` — ever. Use `unknown` and narrow with type guards

### Constants
- Use the `SETTINGS` constant system for settings keys (`server/types/settings.ts`)
- Using an invalid key is a TypeScript compile error — this is intentional
- Never use magic strings/numbers for settings keys

### Naming Conventions
- API route files: `kebab-case` (e.g., `browse/download.post.ts`)
- Vue components: `PascalCase` (e.g., `MediaCard.vue`)
- Composables: `use` prefix + PascalCase file (e.g., `useReveal.ts`)
- Server utils: `kebab-case` (e.g., `browse-utils.ts`)
- Types/interfaces: `PascalCase` (e.g., `BrowseItem`, `SpotlightItem`)
- DB columns: `snake_case` (e.g., `daily_download_limit`)

### Error Handling
- API errors: `createError({ statusCode, statusMessage })`
- Try/catch external calls (TMDB, Prowlarr, Jellyfin, qBittorrent)
- Log errors with `createLogger('ModuleName')` — never `console.log` in app code
- Admin bypass does NOT apply to disk space checks
- User creation: local DB insert FIRST, then external sync (prevents orphans)

### Authentication
- Cookie-based sessions via `nuxt-auth-utils`
- Session cookie `secure: false` for HTTP dev access
- Session validation middleware on every `/api/` request
- Password order for Jellyfin sync: plain text to Jellyfin FIRST, then bcrypt for StreamHub

### Database
- Drizzle ORM with SQLite (default) or PostgreSQL
- Schema in `server/database/schema.ts`
- Migrations in `server/database/migrations/`
- Run `pnpm dev` to auto-apply migrations
- All timestamps stored as ISO 8601 text strings

### i18n
- Default locale: `pl` (Polish) — all Polish translations MUST be in Polish
- Use `t('key')` from `useI18n()` in Vue, `useI18nServer()` in server code
- When changing locale: `setLocale($event)` — NOT `locale.value = $event`
- No Google Translate — all translations are manually written
- UI strings: no hardcoded text, always through i18n keys

### Vue / Component Patterns
- `<script setup lang="ts">` — always use script setup with TypeScript
- `useFetch` / `$fetch` for API calls — `$fetch` on client, `eventFetch` on server
- `useReveal()` composable for scroll-triggered animations
- Use Nuxt UI 4 components (`UButton`, `UModal`, `USelect`, etc.)
- Overlay system: `useOverlay()` + `ConfirmDialog.vue`
