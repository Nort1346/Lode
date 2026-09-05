# Notifications

## Overview

Lode provides real-time notifications through two channels: SSE (Server-Sent Events) for in-app notifications and Web Push (VAPID) for browser push notifications.

## In-App Notifications (SSE)

### Architecture
1. Client opens SSE connection to `/api/notifications/stream`
2. Server sends initial `init` event with unread count
3. New notifications pushed via `notification` event
4. Read status updates via `read_update` and `read_all_update` events
5. Keepalive heartbeat every 30 seconds

### Events
| Event | Data | Description |
|-------|------|-------------|
| `init` | `{ unreadCount }` | Initial state on connect |
| `notification` | `{ notification }` | New notification received |
| `read_update` | `{ notificationId }` | Single notification marked read |
| `read_all_update` | `{}` | All notifications marked read |

### Reconnection
- Auto-reconnect on disconnect
- Exponential backoff: 5s → 10s → 20s → ... → 60s max
- Reset on successful connection

### Notification Types
| Type | Trigger |
|------|---------|
| `download_complete` | Torrent finished downloading |
| `request_accepted` | Admin accepted a request |
| `request_rejected` | Admin rejected a request |

## Browser Push Notifications (VAPID)

### Configuration
```env
NUXT_PUBLIC_VAPID_PUBLIC_KEY=your-public-key
NUXT_VAPID_PRIVATE_KEY=your-private-key
NUXT_VAPID_SUBJECT=mailto:your@email.com
```

### Generate VAPID Keys
```bash
npx web-push generate-vapid-keys
```

### Flow
1. User grants notification permission
2. Service worker registers
3. Push subscription created with VAPID key
4. Subscription sent to `/api/notifications/subscribe`
5. Server stores subscription in `push_subscriptions` table
6. On notification, server sends push to all user subscriptions

### Subscription Management
- **Subscribe**: `POST /api/notifications/subscribe`
- **Unsubscribe**: `POST /api/notifications/unsubscribe`
- **Auto-cleanup**: Expired endpoints removed on send failure

## Sound

New notifications trigger a short audio cue:
- 880Hz sine wave
- 0.15 initial volume
- 300ms duration
- Uses Web Audio API (no audio file needed)

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/notifications` | GET | List notifications + unread count |
| `/api/notifications/stream` | GET | SSE stream |
| `/api/notifications/subscribe` | POST | Subscribe to push |
| `/api/notifications/unsubscribe` | POST | Unsubscribe from push |
| `/api/notifications/read-all` | POST | Mark all as read |
| `/api/notifications/[id]/read` | PATCH | Mark one as read |

## iOS Safari

iOS Safari has limited push notification support:
- No standard Web Push API
- Uses `PwaIOSInstallBanner` component
- Must be added to home screen first
- Push works via Web Push API when installed as PWA
