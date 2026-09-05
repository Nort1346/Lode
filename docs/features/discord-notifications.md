# Discord Notifications

## Overview

Lode sends rich Discord webhook notifications for download completions and new (pending) media requests.

## Configuration

```env
NUXT_DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...
```

## Notification Types

### Download Complete
Sent when a torrent finishes downloading (from the torrent-sync plugin). Includes:
- Media title (TMDB, falling back to the download label) and TMDB overview
- Poster image (TMDB, or a bundled fallback poster)
- Genres, runtime, rating, and release/air date
- File size, save path category, and downloading user
- Parsed torrent metadata: resolution, source, language, codec

### New Request (Pending)
Sent when a user submits a media request. Includes:
- Media title (TMDB, falling back to the stored title)
- Poster image (TMDB)
- Media type (movie/TV) and requesting user
- The user's note, if provided

Accepted/rejected request outcomes do NOT send a Discord webhook - they only produce an in-app notification for the requesting user.

## Components V2

Notifications use Discord's Components V2 format with:
- **Media embed**: TMDB poster image
- **Fields**: Media type, size, save path
- **Footer**: Lode branding
- **Rich formatting**: Markdown text with locale support

## Locale Support

Discord notifications respect the configured locale. Supported values: `pl`, `en`, `de`, `fr`, `es` (default `en` when unset).

Configured via admin panel → Discord Locale.

## User Mentions

When enabled, download-complete notifications mention the user in Discord:
- Requires `discordId` to be set on the user account
- Uses `<@discordId>` mention format
- Only applies to download-complete notifications (not to new-request notifications)
- Can be toggled globally in admin settings

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/admin/discord-locale` | GET | Get current locale |
| `/api/admin/discord-locale` | PUT | Set locale |
| `/api/admin/discord-mentions` | GET | Get mentions enabled status |
| `/api/admin/discord-mentions` | PUT | Toggle mentions |
