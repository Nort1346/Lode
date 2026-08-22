# Architecture

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Nuxt 4 (Vue 3 + Nitro) |
| UI | Nuxt UI 4 + Tailwind CSS v4 |
| Database | Drizzle ORM - SQLite (default) or PostgreSQL |
| Auth | `nuxt-auth-utils` (cookie sessions) |
| Icons | Lucide + Simple Icons (via `@iconify-json/*`) |
| i18n | `@nuxtjs/i18n` v10 - English (default) + pl, de, fr, es (5 locales) |
| PWA | `@vite-pwa/nuxt` - auto-update, service worker |
| Logging | Pino with ring buffer for SSE live logs |

## Project Structure

```
├── app/                        # Frontend (Nuxt 4 app dir)
│   ├── components/             # Vue components (MediaCard, HeroSection, etc.)
│   ├── composables/            # Composables (useNotifications, useCarouselOverflow, etc.)
│   ├── layouts/                # Default layout with sidebar
│   ├── middleware/              # Route guards (auth, admin, submit)
│   ├── pages/                  # File-based routing
│   │   ├── index.vue           # Landing page
│   │   ├── login.vue           # Login / register
│   │   ├── admin/              # 8 admin pages
│   │   ├── browse/             # Browse, movie/[id], tv/[id]
│   │   ├── dashboard/          # Index, downloads, submit, wishlist
│   │   └── user/               # User settings (profile, avatar, password)
│   ├── plugins/                # Client plugins (session-expired)
│   ├── types/                  # Frontend type definitions
│   └── utils/                  # Client utilities
├── server/                     # Backend (Nitro server)
│   ├── api/                    # File-based API routes
│   │   ├── admin/              # 40+ admin endpoints (users, trackers, sessions,
│   │   │                         requests, brute-force, ranking, jellyfin, sync,
│   │   │                         defaults, settings, logs, system-status, ...)
│   │   ├── auth/               # login, logout, register, me
│   │   ├── browse/             # search, autocomplete, popular, trending, top-rated,
│   │   │                         spotlights, genre, discover, logo, download,
│   │   │                         movie/tv detail + per-item torrents
│   │   ├── notifications/      # SSE stream, push subscribe/unsubscribe, vapid-key, read
│   │   ├── requests/           # list, my, mine, create, patch (accept/reject)
│   │   ├── torrents/           # add, list, stats, get, delete
│   │   ├── user/               # me, limits, password, avatar (generate/upload/delete)
│   │   ├── wishlist/           # list, add, remove, check
│   │   └── (top-level)         # health, categories, prep-config, notifications
│   ├── database/               # Drizzle schema + migrations
│   │   ├── drivers/            # SQLite and PostgreSQL DB drivers
│   │   ├── schema.ts           # Runtime resolver (PG/SQLite based on DB_DRIVER)
│   │   ├── schema.sqlite.ts    # SQLite table definitions
│   │   └── schema.pg.ts        # PostgreSQL table definitions
│   ├── middleware/              # Brute force, session validation
│   ├── plugins/                # Server plugins (seed, torrent-sync, etc.)
│   ├── repositories/           # Data access layer (13 repos + factory)
│   ├── types/                  # Server type definitions
│   │   ├── entities.ts         # App-level entity types (User, Download, etc.)
│   │   ├── database.ts         # SqliteDb, PgDb, AppDb types
│   │   └── settings.ts         # SETTINGS constant system
│   └── utils/                  # Server utilities (30+ files)
├── i18n/locales/               # pl, en, de, fr, es (5 locales)
├── shared/                     # Shared code (auth.d.ts type augmentations, ranking.ts default config)
├── docs/                       # This documentation
├── scripts/                    # Migration scripts
└── public/                     # Static assets, PWA icons
```

## Path Aliases

| Alias | Resolves to |
|-------|------------|
| `#server` | `./server` |
| `#db` | `./server/database` |
| `#utils` | `./server/utils` |
| `#shared` | `./shared` (Nuxt 4 built-in alias) |
| `~/` | `./app/` |

## Layout System

The default layout (`app/layouts/default.vue`) provides:

- **Desktop**: Fixed left sidebar (256px / w-64 width) with navigation, user info, theme toggle, language selector, and logout
- **Mobile**: Slide-out sidebar with overlay, hamburger menu trigger
- **Dynamic navigation**: Items added conditionally based on `canSubmit` permission and `admin` role
- **Theme**: Dark/light mode via `useColorMode()` with toggle button
- **Notifications**: SSE connection managed via `useNotifications()` composable
- **PWA**: Install prompts for desktop (standard) and iOS (custom banner)

## Composables

| Composable | Purpose |
|-----------|---------|
| `v-reveal` directive | IntersectionObserver-based scroll reveal animation (registered in `app/plugins/directives.ts`) |
| `useCarouselOverflow()` | Detects horizontal overflow and provides scroll controls |
| `useGoToItem()` | Navigate to movie/TV detail page |
| `useCopyToClipboard()` | Copy text with toast feedback |
| `useNotifications()` | SSE connection, push notifications, read/unread state |
| `useTorrentUtils()` | Format ETA/speed/size, quality badge config |
| `useQualityConfig()` | Torrent health badge colors (dead/poor/slow/ok) |

## Server Plugins

| Plugin | Purpose |
|--------|---------|
| `config-validate.ts` | Validates env vars at startup with Zod |
| `db-seed.ts` | Ensures admin user exists |
| `torrent-sync.ts` | Polls qBittorrent every N seconds for status updates |
| `user-expiry.ts` | Disables expired users every 15 minutes |
| `logs-cleanup.ts` | Deletes activity logs older than 90 days |
| `security-headers.ts` | Sets security response headers (nosniff, DENY frame, referrer/permissions policy) on every request |

## Middleware

| Middleware | Location | Purpose |
|-----------|----------|---------|
| `brute-force.ts` | `server/` | Blocks IPs with too many failed login attempts |
| `session-validate.ts` | `server/` | Validates session in DB, checks `is_active`, touches lastActive, cleans stale entries |
| `auth.ts` | `app/` | Redirects unauthenticated users to `/login` |
| `admin.ts` | `app/` | Restricts admin pages to admin role |
| `submit.ts` | `app/` | Checks `canSubmit` permission before accessing submit page |

## Data Flow

1. **User action** → Vue component calls API endpoint
2. **API endpoint** → Session middleware validates session + `is_active` in DB
3. **Handler** → Calls `requireUser()` (fresh DB query) or `requireAdmin()` for auth
4. **Repository layer** → Data access via `getReposAsync()` → typed repo methods
5. **Server utils** → Interact with external services (TMDB, Prowlarr, qBittorrent, Jellyfin)
6. **Database** → Persists state (Drizzle ORM via `dbGet`/`dbAll`/`dbRun` helpers)
7. **SSE** → Pushes real-time notifications to connected clients
8. **Background plugins** → Sync torrent status, expire users, clean logs

## Repository Layer

Data access is centralized through 13 typed repositories in `server/repositories/`:

| Repository | Table | Purpose |
|-----------|-------|---------|
| `UserRepo` | `users` | CRUD, find by username/role, expired users |
| `DownloadRepo` | `downloads` | CRUD, paginated queries, active/completed counts |
| `SettingRepo` | `settings` | Key-value get/set/delete |
| `SessionRepo` | `sessions` | CRUD, touch, find by user |
| `RequestRepo` | `requests` | CRUD, duplicate detection, paginated |
| `NotificationRepo` | `notifications` | Unread queries, mark read/all read |
| `CustomTrackerRepo` | `custom_trackers` | CRUD, name uniqueness check |
| `ActivityLogRepo` | `activity_logs` | Paginated, count filtered, cleanup |
| `LoginAttemptRepo` | `login_attempts` | Failed count, cleanup |
| `PushSubscriptionRepo` | `push_subscriptions` | Find by user/endpoint, CRUD |
| `WishlistRepo` | `wishlist` | Find by user, duplicate check |
| `SyncProviderRepo` | `sync_providers` | Find by user/provider, update status |
| `SyncUserSettingsRepo` | `sync_user_settings` | Upsert, find, delete |

Factory access:
```ts
const repos = await getReposAsync()  // creates once, caches
const user = await repos.users.findById(userId)
```

Both SQLite and PostgreSQL share the same repo interface. The `dbGet`/`dbAll`/`dbRun` helpers handle dialect differences at runtime.
