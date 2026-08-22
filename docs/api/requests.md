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

## My Request Status

Check the status of the current user's request for a specific media item. Used by media detail pages to show request state and admin notes.

```
GET /api/requests/mine?mediaType=movie&mediaId=550
```

### Query Parameters
| Param | Type | Description |
|-------|------|-------------|
| `mediaType` | string | Required: `movie` or `tv` |
| `mediaId` | number | Required: TMDB media ID |

### Response
```json
{ "status": "pending", "adminNote": null }
```

`status` is `null` when the user has not requested the item.

---

## My Requests

Get all requests by the current user, newest first. This endpoint powers the dashboard request carousel: the client keeps all `pending` requests and only the last 30 days of `accepted`/`rejected` ones, sorted pending → rejected → accepted.

```
GET /api/requests/my
```

### Response
```json
{
  "requests": [{ ... }]
}
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
