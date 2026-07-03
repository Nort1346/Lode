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

Get all downloads for the current user.

```
GET /api/torrents/list
```

### Response
```json
{
  "torrents": [
    {
      "id": "uuid",
      "label": "Movie Name",
      "torrentName": "Movie.Name.2024.1080p.BluRay.x264-GROUP",
      "status": "downloading",
      "progress": 0.75,
      "etaSeconds": 3600,
      "downloadSpeed": 10485760,
      "uploadSpeed: 524288,
      "sizeBytes": 2147483648,
      "downloadedBytes: 1610612736,
      "numSeeds": 150,
      "numLeechs": 10,
      "savePath": "movies",
      "isPrivate": false,
      "tmdbId": 550,
      "mediaType": "movie",
      "posterUrl": "https://image.tmdb.org/..."
    }
  ]
}
```

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

Remove a torrent from qBittorrent and StreamHub.

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
