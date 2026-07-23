# Wishlist API

## List Wishlist

Get the current user's wishlist.

```
GET /api/wishlist
```

### Response
```json
{
  "items": [
    {
      "id": "uuid",
      "userId": "uuid",
      "mediaType": "movie",
      "mediaId": 550,
      "mediaTitle": "Fight Club",
      "mediaPoster": "https://image.tmdb.org/...",
      "createdAt": "2025-01-15T10:30:00.000Z"
    }
  ]
}
```

---

## Add to Wishlist

Add a media item to the wishlist.

```
POST /api/wishlist
```

### Body
```json
{
  "mediaType": "movie",
  "mediaId": 550,
  "mediaTitle": "Fight Club",
  "mediaPoster": "https://image.tmdb.org/..."
}
```

### Response
```json
{ "success": true, "id": "uuid" }
```

### Errors
| Code | Description |
|------|------------|
| 400 | Missing required fields |
| 409 | Already in wishlist |

---

## Remove from Wishlist

Remove an item from the wishlist.

```
DELETE /api/wishlist
```

### Body (option 1 - by ID)
```json
{ "id": "uuid" }
```

### Body (option 2 - by media)
```json
{ "mediaType": "movie", "mediaId": 550 }
```

### Response
```json
{ "success": true }
```

---

## Check Wishlist

Check if a media item is in the wishlist.

```
GET /api/wishlist/check?mediaType=movie&mediaId=550
```

### Response
```json
{
  "wishlisted": true,
  "id": "uuid"
}
```
