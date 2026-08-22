# Browse API

## Search

Search movies and TV shows on TMDB.

```
GET /api/browse/search?q=matrix&type=movie&page=1&locale=pl&movieGenre=28,12
```

### Query Parameters
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `q` | string | required | Search query (min 2 chars) |
| `type` | string | `all` | `movie`, `tv`, or `all` |
| `page` | number | `1` | Page number |
| `locale` | string | `en` | TMDB locale (`en`, `pl`, `de`, `fr`, `es`) |
| `movieGenre` | string | - | Comma-separated movie genre IDs |
| `tvGenre` | string | - | Comma-separated TV genre IDs |

### Response
```json
{
  "results": [{ "id": 550, "type": "movie", "title": "Fight Club", "inLibrary": false, ... }],
  "query": "matrix",
  "page": 1
}
```

---

## Autocomplete

Quick search suggestions for the search box. Returns at most 5 items per media type, sorted by year (newest first). Returns an empty list when the query is shorter than 2 characters or TMDB fails.

```
GET /api/browse/autocomplete?q=fight&type=all&locale=en
```

### Query Parameters
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `q` | string | required | Search query (min 2 chars) |
| `type` | string | `all` | `movie`, `tv`, or `all` |
| `locale` | string | `en` | TMDB locale |

### Response
```json
{
  "suggestions": [
    { "id": 550, "title": "Fight Club", "type": "movie", "posterUrl": "https://image.tmdb.org/...", "year": "1999" }
  ]
}
```

---

## Popular

Get popular movies and TV shows.

```
GET /api/browse/popular?locale=pl
```

### Response
```json
{
  "movies": [{ ... }],
  "tv": [{ ... }]
}
```

---

## Trending

Get trending content (movies and TV mixed).

```
GET /api/browse/trending?locale=pl
```

### Response
```json
{
  "items": [{ ..., "logoUrl": "https://...", ... }]
}
```

---

## Top Rated

Get top-rated movies.

```
GET /api/browse/top-rated?locale=pl
```

### Response
```json
{
  "movies": [{ ... }]
}
```

---

## Spotlights

Get 5 random spotlight items from a shuffled genre pool.

```
GET /api/browse/spotlights?locale=pl
```

### Response
```json
{
  "items": [{ "id": 550, "type": "movie", "title": "Fight Club", "inLibrary": false, ... }]
}
```

---

## Genre

Get items by genre.

```
GET /api/browse/genre?genreId=28&mediaType=movie&locale=pl
```

### Query Parameters
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `genreId` | number | required | TMDB genre ID |
| `mediaType` | string | `movie` | `movie` or `tv` |
| `locale` | string | `en` | TMDB locale (`en`, `pl`, `de`, `fr`, `es`) |

---

## Discover

Get items by multiple genre IDs.

```
GET /api/browse/discover?movieGenre=28,12&tvGenre=10759&type=all&locale=pl
```

### Response
```json
{
  "results": [{ ... }]
}
```

---

## Movie Detail

Get movie details from TMDB.

```
GET /api/browse/movie/550?locale=pl
```

---

## TV Show Detail

Get TV show details from TMDB.

```
GET /api/browse/tv/1399?locale=pl
```

---

## Season Detail

Get season details with per-episode torrents.

```
GET /api/browse/tv/1399/season/1?locale=pl
```

### Response
```json
{
  "show": { "id": 1399, "name": "Game of Thrones" },
  "season": { "seasonNumber": 1, "name": "Season 1", ... },
  "episodes": [
    {
      "episodeNumber": 1,
      "name": "Winter Is Coming",
      "torrents": [{ "title": "...", "score": 85, "recommended": true, ... }]
    }
  ],
  "seasonPacks": [{ ... }]
}
```

---

## Movie Torrents

Search for movie torrents via Prowlarr.

```
GET /api/browse/movie/550/torrents?locale=pl
```

### Response
```json
{
  "torrents": [
    {
      "title": "Fight Club 1999 1080p BluRay x264-GROUP",
      "size": 2147483648,
      "sizeFormatted": "2.00 GB",
      "seeders": 150,
      "leechers": 10,
      "score": 85,
      "recommended": true,
      "resolution": "1080p",
      "source": "blu-ray",
      "language": "en",
      "isPrivate": false
    }
  ]
}
```

---

## TV Torrents

Search for TV show torrents via Prowlarr.

```
GET /api/browse/tv/1399/torrents?locale=pl
```

---

## Download

Add a torrent to qBittorrent.

```
POST /api/browse/download
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

### Save Paths
`movies`, `series`, `games`, `books`, `music`

### Errors
| Code | Description |
|------|------------|
| 400 | Invalid input |
| 401 | Not authenticated |
| 413 | Torrent too large |
| 429 | Rate limited or limit reached |
| 403 | Dangerous files detected |
| 507 | Insufficient disk space |
| 502 | qBittorrent or indexer error |

---

## Logo

Fetch logo image for a media item.

```
GET /api/browse/logo?id=550&mediaType=movie&locale=pl
```
