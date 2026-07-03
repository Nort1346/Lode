# Discord Notifications

## Overview

StreamHub sends rich Discord webhook notifications for download completions and request status changes.

## Configuration

```env
NUXT_DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...
```

## Notification Types

### Download Complete
Sent when a torrent finishes downloading. Includes:
- Media title and type (movie/TV)
- File size
- Poster image (from TMDB)
- Save path category

### Request Accepted/Rejected
Sent when an admin accepts or rejects a user's media request.

## Components V2

Notifications use Discord's Components V2 format with:
- **Media embed**: TMDB poster image
- **Fields**: Media type, size, save path
- **Footer**: StreamHub branding
- **Rich formatting**: Markdown text with locale support

## Locale Support

Discord notifications respect the configured locale:

| Locale | Description |
|--------|-------------|
| `pl` | Polish notifications |
| `en` | English notifications |

Configured via admin panel → Discord Locale.

## User Mentions

When enabled, download notifications mention the user in Discord:
- Requires `discordId` to be set on the user account
- Uses `<@discordId>` mention format
- Configurable per notification type
- Can be toggled globally in admin settings

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/admin/discord-locale` | GET | Get current locale |
| `/api/admin/discord-locale` | PUT | Set locale |
| `/api/admin/discord-mentions` | GET | Get mentions enabled status |
| `/api/admin/discord-mentions` | PUT | Toggle mentions |
