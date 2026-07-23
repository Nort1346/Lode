# StreamHub Documentation

Self-hosted streaming hub for managing torrent downloads. Browse movies and TV shows from TMDB, find torrents via Prowlarr, and download with one click.

## Table of Contents

### Getting Started
- [Getting Started](./getting-started.md) - Prerequisites, installation, first run, Docker quick start
- [Configuration](./configuration.md) - All environment variables, SETTINGS keys, Zod validation

### Architecture
- [Architecture](./architecture.md) - Project structure, tech stack, composables, layout system
- [Database](./database.md) - Schema (13 tables), migrations, SQLite vs PostgreSQL
- [Deployment](./deployment.md) - Docker setup, Dockerfile stages, volumes, production tips

### Features
- [Browse & Search](./features/browse-and-search.md) - Carousels, spotlights, search, in-library detection, genre filters, reveal animations
- [Torrent Submission](./features/torrent-submission.md) - 3 input methods, validation, mutex lock, cooldown, dangerous file rejection
- [Download Management](./features/download-management.md) - Dashboard, downloads page, statuses, quality badges, prep countdown
- [User System](./features/user-system.md) - Roles, limits, authentication, sessions, brute force, auto-expiration
- [Jellyfin Integration](./features/jellyfin-integration.md) - Library detection, cache, platform sync, avatar, Live TV, presets
- [Discord Notifications](./features/discord-notifications.md) - Webhook, locale, mentions, Components V2
- [Private Trackers](./features/private-trackers.md) - Cookie/login auth, GUID flow, encryption, got-scraping
- [Ranking System](./features/ranking-system.md) - Configurable scoring engine, weights, thresholds
- [Requests & Wishlist](./features/requests-wishlist.md) - Request flow, wishlist, carousel visibility rules
- [i18n](./features/i18n.md) - Locales, TMDB locale, server-side i18n, Google Translate prevention
- [PWA](./features/pwa.md) - Progressive Web App, icons, service worker, install prompts
- [Notifications](./features/notifications.md) - SSE real-time, browser push, VAPID, iOS Safari
- [Admin Features](./features/admin-features.md) - Live logs viewer, activity logs, session management, click-to-copy

### API Reference
- [API Overview](./api/README.md) - Authentication, base URL, response format
- [Auth](./api/auth.md) - Login, logout, register, session
- [Browse](./api/browse.md) - Search, popular, trending, genre, movie/TV detail, download
- [Torrents](./api/torrents.md) - Add (3 methods), list, delete
- [Requests](./api/requests.md) - Create, list, accept/reject, mine
- [Wishlist](./api/wishlist.md) - Add, remove, list, check
- [Notifications](./api/notifications.md) - List, stream SSE, read, push subscribe
- [Admin](./api/admin.md) - All admin endpoints

### Guides
- [Migrating to PostgreSQL](./MIGRATE-TO-POSTGRES.md) - Step-by-step SQLite to PostgreSQL migration
- [Development](./development.md) - Scripts, ESLint config, code conventions, Vitest testing
