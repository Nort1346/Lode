# Architecture

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Nuxt 4 (Vue 3 + Nitro) |
| UI | Nuxt UI 4 + Tailwind CSS v4 |
| Database | Drizzle ORM — SQLite (default) or PostgreSQL |
| Auth | `nuxt-auth-utils` (cookie sessions) |
| Icons | Lucide + Simple Icons (via `@iconify-json/*`) |
| i18n | `@nuxtjs/i18n` v10 — English (default) + pl, de, fr, es (5 locales) |
| PWA | `@vite-pwa/nuxt` — auto-update, service worker |
| Logging | Pino with ring buffer for SSE live logs |

## Project Structure

```
├── app/                        # Frontend (Nuxt 4 app dir)
│   ├── components/             # Vue components (MediaCard, HeroSection, etc.)
│   ├── composables/            # Composables (useNotifications, useCarouselOverflow, etc.)
│   ├── layouts/                # Default layout with sidebar
│   ├── middleware/              # Route guards (auth, admin, submit)
│   ├── pages/                  # File-based routing
│   │   ├── admin/              # 8 admin pages
│   │   ├── browse/             # Browse, movie/[id], tv/[id]
│   │   └── dashboard/          # Index, downloads, submit, wishlist
│   ├── plugins/                # Client plugins (session-expired)
│   ├── types/                  # Frontend type definitions
│   └── utils/                  # Client utilities
├── server/                     # Backend (Nitro server)
│   ├── api/                    # File-based API routes
│   │   ├── admin/              # 25+ admin endpoints
│   │   ├── auth/               # login, logout, register, me
│   │   ├── browse/             # discover, search, spotlights, etc.
│   │   ├── notifications/      # SSE stream, push subscribe
│   │   ├── requests/           # CRUD + accept/reject
│   │   ├── torrents/           # add, list, delete
│   │   ├── user/               # me, limits
│   │   └── wishlist/           # CRUD + check
│   ├── database/               # Drizzle schema + migrations
│   ├── middleware/              # Brute force, session validation
│   ├── plugins/                # Server plugins (seed, torrent-sync, etc.)
│   ├── types/                  # Server type definitions
│   └── utils/                  # Server utilities (30+ files)
├── i18n/locales/               # pl, en, de, fr, es (5 locales)
├── shared/                     # Shared type augmentations (auth.d.ts)
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

## Middleware

| Middleware | Location | Purpose |
|-----------|----------|---------|
| `brute-force.ts` | `server/` | Blocks IPs with too many failed login attempts |
| `session-validate.ts` | `server/` | Validates session still exists in DB, touches lastActive |
| `auth.ts` | `app/` | Redirects unauthenticated users to `/login` |
| `admin.ts` | `app/` | Restricts admin pages to admin role |
| `submit.ts` | `app/` | Checks `canSubmit` permission before accessing submit page |

## Data Flow

1. **User action** → Vue component calls API endpoint
2. **API endpoint** → Validates session, checks permissions
3. **Server utils** → Interact with external services (TMDB, Prowlarr, qBittorrent, Jellyfin)
4. **Database** → Persists state (Drizzle ORM)
5. **SSE** → Pushes real-time notifications to connected clients
6. **Background plugins** → Sync torrent status, expire users, clean logs
