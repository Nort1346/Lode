# Development

## Scripts

| Command | Description |
|---------|-------------|
| `pnpm dev` | Run migrations + start dev server |
| `pnpm build` | Production build |
| `pnpm build:preview` | Build + preview with host binding |
| `pnpm preview` | Preview production build |
| `pnpm lint` | ESLint check |
| `pnpm lint:fix` | ESLint auto-fix |
| `pnpm format` | Prettier format |
| `pnpm format:check` | Prettier check |
| `pnpm typecheck` | Nuxt type checking |
| `pnpm test` | Run the Vitest test suite (API routes, middleware, server utils) |
| `pnpm test:watch` | Run Vitest in watch mode |
| `pnpm test:coverage` | Run tests with V8 coverage reporting |
| `pnpm test:e2e` | Playwright E2E tests (isolated `.data-e2e` DB + mock TMDB, app on port 5758) |
| `pnpm typecheck:test` | Type-check the test suite (`test/tsconfig.json`) |
| `pnpm typecheck:e2e` | Type-check `e2e/tsconfig.json` |
| `pnpm db:generate` | Generate Drizzle migrations |
| `pnpm db:migrate` | Run migrations |
| `pnpm db:studio` | Open Drizzle Studio |

`pnpm typecheck` now also type-checks the e2e project (`e2e/tsconfig.json`).

## ESLint Configuration

The project uses strict TypeScript ESLint with `projectService: true` for full type-aware linting.

### Server files (`server/**/*.ts`)

- `no-console: off` - server logging is allowed
- `eqeqeq: always` - strict equality required
- All `@typescript-eslint/no-unsafe-*` rules set to `error`
- `strict-boolean-expressions: warn`
- `no-floating-promises: error` - all promises must be handled
- `no-misused-promises: error` - no async in non-async contexts
- `await-thenable: error` - only await thenables
- `no-non-null-assertion: error`

### App files (`app/**/*.ts`)

- `no-console: warn` - console usage triggers a warning
- `eqeqeq: always`
- Same `no-unsafe-*` rules as server
- `no-non-null-assertion: error`

### App Vue components (`app/**/*.vue`)

- `no-console: warn`
- `eqeqeq: always`
- Same strict `no-unsafe-*`, promise, and style rules as server files
- Type-aware linting via `projectService` with `extraFileExtensions: ['.vue']`

### Common Rules

- Unused vars: warning (with `^_` ignore pattern for args, vars, and caught errors)
- `consistent-type-assertions: error`
- `require-array-sort-compare: error` (server only)
- `no-deprecated: warn` (server only)

## Code Conventions

### Types in Separate Files

All type definitions MUST be in separate `types.ts` files:
- Server types: `server/types/*.ts`
- App types: `app/types/*.ts`
- Shared types: `shared/*.d.ts`

### Constants Over Magic Values

Use the `SETTINGS` constant system (`server/types/settings.ts`) for all settings keys. Using an invalid key is a TypeScript compile error.

```ts
import { SETTINGS } from '#server/types/settings'

// ✅ Correct
putSetting(SETTINGS.PREP_DELAY_SECONDS, '30')

// ❌ Wrong - compile error
putSetting('prep_delay_seconds', '30')
```

### Naming Conventions

- **API routes**: `kebab-case` (e.g., `browse/download.post.ts`)
- **Components**: PascalCase (e.g., `MediaCard.vue`)
- **Composables**: `use` prefix + PascalCase (e.g., `useNotifications.ts`)
- **Server utils**: kebab-case (e.g., `browse-utils.ts`)
- **Types**: PascalCase interfaces (e.g., `BrowseItem`, `SpotlightItem`)

### i18n

- Default locale: `en` (English)
- All UI strings MUST use `t('key')` from `useI18n()`
- When changing locale: `setLocale($event)` (not `locale = $event`)
- Polish translations MUST be in Polish - no English fallbacks for Polish locale
- No Google Translate - all translations are manually written

### Authentication

- Cookie-based sessions via `nuxt-auth-utils`
- Session cookie must set `secure: false` for HTTP development
- Password order is critical: plain text to Jellyfin FIRST, then bcrypt hash for Lode

### Conventional Commits

The project uses conventional commit messages:
```
feat: add new feature
fix: bug fix
refactor: code refactoring
docs: documentation changes
```

## Testing

The project uses **Vitest** (`vitest` 5.x) with `@nuxt/test-utils` and `@vitest/coverage-v8`.

### Configuration

Defined in `vitest.config.ts`:

- **Include**: `test/**/*.test.ts`
- **Setup**: `test/setup.ts` - stubs `h3` globals (`defineEventHandler`, `createError`, `readBody`, `getQuery`) so API handlers can be unit-tested without a running server.
- **Environment**: `node`
- **Path aliases**: `#server`, `#db`, `#utils`, `#server/types` are mapped to the `server/` tree; `#shared` maps to `shared/`.
- **Coverage**: V8 provider, `text` + `lcov` reporters, scoped to `server/utils`, `server/api`, and `server/middleware`.

E2E is configured in `playwright.config.ts` (`testDir: ./e2e/tests`, `globalSetup`/`globalTeardown`, single worker, Chromium, `baseURL: http://127.0.0.1:5758`, service workers blocked). DB parity is configured in `vitest.db-parity.config.ts` with projects `db-parity-sqlite` and `db-parity-postgres`; PG tests skip when `LODE_PG_TEST_URL` is absent.

### Structure

```
e2e/                    # Playwright suite
├── tests/              # auth, admin-users, browse, requests, smoke, titles specs
├── global-setup.ts / global-teardown.ts
├── mock-tmdb.ts / seed.ts / credentials.ts / helpers.ts
└── tsconfig.json

test/
├── setup.ts              # Global h3 stubs
├── tsconfig.json         # Dedicated typecheck config for tests
├── api/                  # Route handlers (auth, browse, torrents, requests, wishlist, notifications, admin/*)
├── app/                  # Composables and client-side logic (useApiError, useTorrentSearch, etc.)
├── db-parity/            # SQLite/PostgreSQL parity
│   ├── cross/            # Schema parity across both migration chains
│   ├── drivers/          # Same CRUD probes on SQLite and PostgreSQL
│   └── fixtures.ts
├── i18n/                 # Locale key parity and server i18n tests
├── middleware/           # Session validation + brute force middleware
├── repositories/         # Data access layer (settings, login-attempts, sync-user-settings)
├── shared/               # Shared modules (torrent-filters, ranking, i18n keys)
├── utils/                # Server utils (ranking, disk, limits, auth, format, etc.)
└── types/                # Shared test type helpers
```

Root-level files for these suites: `playwright.config.ts`, `vitest.db-parity.config.ts`, plus CI workflows `.github/workflows/e2e.yml` and `.github/workflows/db-parity.yml`.

### Commands

```bash
pnpm test            # run all tests once
pnpm test:watch      # watch mode
pnpm test:coverage   # with coverage report
pnpm typecheck:test  # type-check tests only
pnpm test:e2e
pnpm typecheck:e2e
pnpm exec vitest run -c vitest.db-parity.config.ts
# with PG: LODE_PG_TEST_URL=postgres://lode:<pw>@127.0.0.1:54335/postgres pnpm exec vitest run -c vitest.db-parity.config.ts
```

### Conventions

- External services (TMDB, Prowlarr, qBittorrent, Jellyfin, Discord) are mocked in tests - no network calls.
- API route tests invoke handlers directly with a mocked `event` object.
- Add a `.test.ts` file next to the code it covers, following the same directory layout as `server/`.
- Mock the repository layer (`#server/repositories`) instead of direct drizzle queries - simpler, faster, and tests the handler logic not the query builder.
- DOM-based app composable tests type-check via `test/tsconfig.json` (which now includes the DOM lib).
- E2E uses seeded users from `e2e/credentials.ts` and a deterministic mock TMDB, so no external services are contacted.

