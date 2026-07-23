# Requests API

## Create Request

Submit a media request.

```
POST /api/requests/post
```

### Body
```json
{
  "mediaType": "movie",
  "mediaId": 550,
  "mediaTitle": "Fight Club",
  "mediaPoster": "https://image.tmdb.org/...",
  "userNote": "Please get 1080p if possible"
}
```

### Response
```json
{ "success": true, "id": "uuid" }
```

---

## List All Requests (Admin)

Get all requests with pagination.

```
GET /api/requests/list?page=1&limit=50&status=pending
```

### Query Parameters
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `page` | number | `1` | Page number |
| `limit` | number | `50` | Items per page (max 100) |
| `status` | string | - | Filter: `pending`, `accepted`, `rejected` |

### Response
```json
{
  "requests": [{ ... }],
  "page": 1,
  "totalPages": 5,
  "total": 250
}
```

---

## My Requests (30-Day Carousel)

Get recent requests for the carousel (30-day window).

```
GET /api/requests/mine
```

### Visibility Rules
- `pending`: Always shown
- `accepted`: Shown for 30 days
- `rejected`: Shown for 30 days

### Response
```json
{
  "requests": [{ ... }]
}
```

---

## All My Requests

Get all requests by the current user.

```
GET /api/requests/my
```

---

## Accept/Reject Request (Admin)

Update a request's status.

```
PATCH /api/requests/[id]
```

### Body
```json
{
  "status": "accepted",
  "adminNote": "Will download tonight"
}
```

### Status Values
- `accepted` - Request approved
- `rejected` - Request denied

### Response
```json
{ "success": true }
```
