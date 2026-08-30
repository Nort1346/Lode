# Changelog

All notable changes to StreamHub will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [1.0.0] - 2026-08-30

Initial public release.

### Added

- Browse & Search with TMDB carousels (Popular, Trending, Top Rated), spotlights, genre discovery, and debounced full-text search
- TMDB localization - browse results and metadata follow the selected UI locale
- In-library detection - browse items flagged when already present in Jellyfin libraries
- One-click torrent download via magnet link, torrent URL, or uploaded .torrent file
- Torrent Ranking System with configurable weighted scoring engine (max 205 base points - resolution, language, seeders, size, source, group), title relevance, and season-pack detection
- Private Tracker Support with cookie and login auth (GUID and counting trackers), server-side credential encryption, test-login endpoint, auto-retry on session expiry, and FlareSolverr CAPTCHA bypass
- Download safety - dangerous file rejection, per-user cooldown rate limiting, per-user max torrent size, and pre-download disk space check with multi-disk support and editable thresholds
- Torrent sync plugin with configurable background interval (10s default) keeping progress, speeds, and seeder counts fresh
- Quality badges (dead/poor/slow/ok) derived from download speed and ETA
- Active downloads pinned to the top of the downloads list
- Admin downloads bypass per-user limits and are moved to the top of the qBittorrent queue
- User Management with per-user daily/active download limits, max torrent size, private tracker limits, canSubmit flag, and password generation
- Brute-force login protection, auto-expiring accounts, and server-side session validation with per-user session limits
- Admin session management panel with server-side validation
- Jellyfin Integration with library detection, user CRUD sync with per-provider sync status, avatar upload, Jellyfin presets, Live TV config, and realtime library monitoring for auto-created libraries
- DiceBear avatar system with 12 styles, upload, and Jellyfin sync
- Request & Wishlist system with admin approve/reject review, dashboard request carousel, and Discord notification on new requests
- Notifications with SSE real-time in-app (notification sound, iOS Safari support), Discord webhooks (locale-aware, configurable user mentions, Components v2 embeds), and browser push (VAPID)
- Admin Panel with activity and live log streams, system status, disk monitoring with low-disk blocking, ranking config, Jellyfin presets, Discord settings, and click-to-copy
- Configurable prep countdown for file transfer estimation
- PWA support with install prompt, auto-update, offline support, and push notifications
- i18n with 6 languages (EN, PL, DE, FR, ES, PT-BR), including TMDB and Discord locale support
- PostgreSQL support alongside default SQLite (dual driver via DB_DRIVER)
- Health check endpoint with database connectivity status
- Optional Redis caching for TMDB and Prowlarr results
- Docker deployment with multi-stage build and docker-compose for both SQLite and PostgreSQL
- Auto-setup scripts for Linux/macOS (bash) and Windows (PowerShell) with guided 14-step wizard
- Zod config validation at startup
- Scroll reveal animations throughout the UI
- Responsive pagination with useBreakpoints composable
- 857 unit tests across 120 test files
