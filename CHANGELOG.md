# Changelog

All notable changes to StreamHub will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [1.0.0] - 2026-07-27

Initial public release.

### Added

- Browse & Search with TMDB carousels, spotlights, genre filters, and debounced search
- Torrent Ranking System with configurable 240-point scoring engine (resolution, language, seeders, source)
- Private Tracker Support with cookie/login auth, auto-retry on session expiry, and FlareSolverr bypass
- User Management with per-user limits, brute-force protection, auto-expiration, and password generation
- Jellyfin Integration with library detection, user CRUD sync, avatar upload, and Live TV config
- Request & Wishlist system for user title requests and saving titles for later
- Notifications with SSE real-time, Discord webhooks, and browser push (VAPID)
- Admin Panel with live logs, system status, disk monitoring, and ranking config
- PWA support with installable app, offline support, and push notifications
- i18n with 5 languages (EN, PL, DE, FR, ES)
- PostgreSQL support alongside default SQLite (dual driver)
- Docker deployment with multi-stage build and docker-compose for both SQLite and PostgreSQL
- Auto-setup scripts for Linux/macOS (bash) and Windows (PowerShell) with guided 12-step wizard
- Torrent sync plugin with 10-second background interval
- DiceBear avatar system with upload and Jellyfin sync
- Zod config validation at startup
- Configurable prep countdown for file transfer estimation
- Disk space monitoring with multi-disk support and editable thresholds
- Discord configurable user mentions in download completion notifications
- Admin session management with server-side validation and session limit
- Low disk space blocking with multi-disk support
- Auto-reject torrents with dangerous files from browse catalog
- Admin priority for torrents in qBittorrent queue
- Scroll reveal animations throughout the UI
- Responsive pagination with useBreakpoints composable
- 629 unit tests across 103 test files
