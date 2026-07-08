# API Reference

## Overview

All API endpoints are served under `/api/` via Nitro's file-based routing.

## Authentication

Most endpoints require an authenticated session cookie. The cookie is set on login and validated on every request via server middleware.

### Protected Endpoints
- Return `401 Unauthorized` if no valid session
- Return `403 Forbidden` if insufficient permissions

### Admin Endpoints
- Return `403 Forbidden` if user is not admin
- Located under `/api/admin/`

## Request Format

### JSON Body
```http
Content-Type: application/json
```

### Query Parameters
```
GET /api/browse/search?q=matrix&type=movie&page=1&locale=pl
```

### Path Parameters
```
GET /api/browse/movie/550
DELETE /api/torrents/abc123
```

## Response Format

### Success
```json
{
  "success": true,
  "id": "uuid"
}
```

### Data Response
```json
{
  "results": [...],
  "query": "matrix",
  "page": 1
}
```

### Error
```json
{
  "statusCode": 400,
  "statusMessage": "Invalid input"
}
```

## Rate Limiting

- **Brute force protection**: Login endpoint blocked after N failed attempts per IP
- **Torrent cooldown**: 5-second delay between torrent additions per user
- **Daily limits**: Per-user configurable download limits

## SSE Endpoints

Server-Sent Events endpoints return `text/event-stream`:

```
GET /api/notifications/stream
GET /api/admin/logs-stream
```

Format:
```
data: {"type":"init","unreadCount":5}

data: {"type":"notification","notification":{...}}

:keepalive
```

## Base URL

All endpoints are relative to the application root:
```
http://localhost:5757/api/...
```

In production, use your domain:
```
https://streamhub.example.com/api/...
```
