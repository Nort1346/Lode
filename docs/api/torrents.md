# Torrents API

## Add Torrent

Add a torrent to qBittorrent (same as Browse Download).

```
POST /api/torrents/add
```

### Body
```json
{
  "magnetLink": "magnet:?xt=...",
  "downloadUrl": "https://...",
  "guid": "https://...",
  "indexer": "TrackerName",
  "label": "Movie Name",
  "savePath": "movies",
  "tmdbId": 550,
  "mediaType": "movie"
}
```

### Response
```json
{ "success": true, "id": "uuid" }
```

---

## List Torrents

Get paginated downloads. Regular users see their own downloads; admins see all downloads (with a `username` field on each). A qBittorrent sync runs before reading so statuses are fresh.

```
GET /api/torrents/list?page=1&limit=10&status=downloading
```

### Query Parameters
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `page` | number | `1` | Page number |
| `limit` | number | `10` | Items per page (max 100) |
| `status` | string | - | Filter: `pending`, `downloading`, `completed`, `failed`, `paused`, `removed`, `disk_full` |

### Response
```json
{
  "downloads": [
    {
      "id": "uuid",
      "label": "Movie Name",
      "torrentName": "Movie.Name.2024.1080p.BluRay.x264-GROUP",
      "status": "downloading",
      "progress": 0.75,
      "etaSeconds": 3600,
      "downloadSpeed": 10485760,
      "uploadSpeed": 524288,
      "sizeBytes": 2147483648,
      "downloadedBytes": 1610612736,
      "numSeeds": 150,
      "numLeechs": 10,
      "savePath": "movies",
      "isPrivate": false,
      "tmdbId": 550,
      "mediaType": "movie",
      "posterUrl": "https://image.tmdb.org/...",
      "username": "admin"
    }
  ],
  "total": 42,
  "page": 1,
  "limit": 10
}
```

`username` is only present when an admin requests the list.

---

## Download Stats

Get summary stats. Admins see fleet-wide stats; regular users see their own. A qBittorrent sync runs before reading.

```
GET /api/torrents/stats
```

### Response
```json
{
  "active": 3,
  "createdSince": 5,
  "completedSince": 2,
  "sinceIso": "2025-01-15T00:00:00.000Z"
}
```

| Field | Description |
|-------|-------------|
| `active` | Downloads currently in `downloading` status |
| `createdSince` | Downloads created since `sinceIso` |
| `completedSince` | Downloads completed since `sinceIso` |
| `sinceIso` | Local start-of-day (ISO 8601) used for the `*Since` counts |

---

## Get Torrent

Get details for a specific download.

```
GET /api/torrents/[id]
```

### Response
Single torrent object with full details.

---

## Delete Torrent

Remove a torrent from qBittorrent and Lode.

```
DELETE /api/torrents/[id]
```

### Response
```json
{ "success": true }
```

### Errors
| Code | Description |
|------|------------|
| 404 | Torrent not found |
| 502 | qBittorrent error |
