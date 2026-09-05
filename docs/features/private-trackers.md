# Private Trackers

## Overview

Lode supports private trackers through cookie-based or login-based authentication. Private trackers are managed in the admin panel and support both GUID (direct torrent file) and counting (magnet link) tracker types.

## Tracker Types

### GUID Trackers
- Download torrent files directly via HTTP
- Require authentication (cookie or login credentials)
- Support automatic session refresh on expiry
- Use `got-scraping` with Chrome TLS impersonation

### Counting Trackers
- Use standard magnet links
- No special authentication needed
- Tracked for daily limit purposes

## Authentication Methods

### Cookie-Based
- Admin provides session cookie from browser
- Stored in `custom_trackers.cookie`
- Used directly in HTTP requests
- Must be refreshed manually when expired

### Login-Based
- Admin provides login URL, username, and password
- Password encrypted with AES-256-GCM
- Lode performs web scraping login
- Cookies cached in memory
- Automatic retry on session expiry

## Login Flow

1. **Form detection**: Parses login page for form fields
2. **Credential submission**: POST to login endpoint
3. **Cookie collection**: Gathers all session cookies
4. **Redirect handling**: Follows redirects after login
5. **Session caching**: Caches cookies with login URL + username key

### Session Retry
When a torrent download returns HTML instead of a torrent file:
1. Detects session expiry
2. Clears cached session
3. Re-authenticates with stored credentials
4. Retries the download once

## Encryption

Login passwords are encrypted with AES-256-GCM:
- Key: `NUXT_TRACKER_ENCRYPTION_KEY` (64 hex chars)
- Stored as encrypted ciphertext in DB
- Decrypted at runtime when needed

Generate a key:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## Admin Management

### Add Tracker
1. Go to Admin → Trackers
2. Click "Add Tracker"
3. Enter indexer name
4. Select type (guid/counting)
5. Provide cookie OR login credentials
6. Save

### Test Login
- Click "Test" on any login-based tracker
- Attempts login and reports success/failure
- Shows cookie preview on success

### Edit/Delete
- Update cookie or credentials
- Toggle enabled/disabled
- Delete tracker entirely

## Download Flow for Private Trackers

1. User selects a torrent from Prowlarr results
2. Lode detects `isPrivate` from indexer name
3. Fetches tracker config from `custom_trackers` table
4. For GUID trackers:
   - Downloads torrent file via `got-scraping`
   - Validates response (not HTML, valid bencode)
   - Retries login on session expiry
5. Adds torrent file to qBittorrent via `addTorrentFile`
6. Records as private download for limit tracking
