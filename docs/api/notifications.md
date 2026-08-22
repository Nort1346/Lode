# Notifications API

## List Notifications

Get all notifications for the current user.

```
GET /api/notifications
```

### Response
```json
{
  "notifications": [
    {
      "id": "uuid",
      "type": "download_complete",
      "title": "Download Complete",
      "message": "Fight Club has finished downloading",
      "link": "/dashboard/downloads",
      "data": { "downloadId": "uuid", "mediaType": "movie", ... },
      "read": false,
      "createdAt": "2025-01-15T10:30:00.000Z"
    }
  ],
  "unreadCount": 3
}
```

---

## SSE Stream

Real-time notification stream.

```
GET /api/notifications/stream
```

### Events
```
data: {"type":"init","unreadCount":3}

data: {"type":"notification","notification":{...}}

data: {"type":"read_update","notificationId":"uuid"}

data: {"type":"read_all_update"}

:keepalive
```

---

## VAPID Public Key

Get the VAPID public key used to build Web Push subscriptions. Public (no auth required).

```
GET /api/notifications/vapid-key
```

### Response
```json
{ "publicKey": "BHx..." }
```

---

## Subscribe to Push

Register a Web Push subscription.

```
POST /api/notifications/subscribe
```

### Body
```json
{
  "endpoint": "https://fcm.googleapis.com/...",
  "keys": {
    "p256dh": "...",
    "auth": "..."
  }
}
```

### Response
```json
{ "success": true, "id": "uuid" }
```

---

## Unsubscribe from Push

Remove a push subscription.

```
POST /api/notifications/unsubscribe
```

### Body
```json
{
  "endpoint": "https://fcm.googleapis.com/..."
}
```

Or omit `endpoint` to remove all subscriptions.

### Response
```json
{ "success": true, "count": 2 }
```

---

## Mark All as Read

Mark all notifications as read.

```
POST /api/notifications/read-all
```

### Response
```json
{ "success": true, "count": 5 }
```

---

## Mark as Read

Mark a single notification as read.

```
PATCH /api/notifications/[id]/read
```

### Response
```json
{ "success": true }
```
