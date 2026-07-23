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
| `pnpm typecheck:test` | Type-check the test suite (`test/tsconfig.json`) |
| `pnpm db:generate` | Generate Drizzle migrations |
| `pnpm db:migrate` | Run migrations |
| `pnpm db:migrate-pg` | SQLite → PostgreSQL migration |
| `pnpm db:studio` | Open Drizzle Studio |

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
putSetting(SETTINGS.PREP_SPEED_MB, '15')

// ❌ Wrong - compile error
putSetting('prep_speed_mb', '15')
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
- Password order is critical: plain text to Jellyfin FIRST, then bcrypt hash for StreamHub

### Conventional Commits

The project uses conventional commit messages:
```
feat: add new feature
fix: bug fix
refactor: code refactoring
docs: documentation changes
```

## Testing

The project uses **Vitest** (`vitest` 4.x) with `@nuxt/test-utils` and `@vitest/coverage-v8`.

### Configuration

Defined in `vitest.config.ts`:

- **Include**: `test/**/*.test.ts`
- **Setup**: `test/setup.ts` - stubs `h3` globals (`defineEventHandler`, `createError`, `readBody`, `getQuery`) so API handlers can be unit-tested without a running server.
- **Environment**: `node`
- **Path aliases**: `#server`, `#db`, `#utils`, `#server/types` are mapped to the `server/` tree.
- **Coverage**: V8 provider, `text` + `lcov` reporters, scoped to `server/utils`, `server/api`, and `server/middleware`.

### Structure

```
test/
├── setup.ts              # Global h3 stubs
├── tsconfig.json         # Dedicated typecheck config for tests
├── api/                  # Route handlers (auth, browse, torrents, requests, wishlist, notifications, admin/*)
├── middleware/           # Session validation + brute force middleware
├── utils/                # Server utils (ranking, disk, limits, auth, format, etc.)
└── types/                # Shared test type helpers
```

### Commands

```bash
pnpm test            # run all tests once
pnpm test:watch      # watch mode
pnpm test:coverage   # with coverage report
pnpm typecheck:test  # type-check tests only
```

### Conventions

- External services (TMDB, Prowlarr, qBittorrent, Jellyfin, Discord) are mocked in tests - no network calls.
- API route tests invoke handlers directly with a mocked `event` object.
- Add a `.test.ts` file next to the code it covers, following the same directory layout as `server/`.
- Mock the repository layer (`#server/repositories`) instead of direct drizzle queries - simpler, faster, and tests the handler logic not the query builder.

