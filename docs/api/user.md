# User API

Self-service endpoints for the authenticated user.

## Current User

Get the current user's profile and limits.

```
GET /api/user/me
```

### Response
```json
{
  "id": "uuid",
  "username": "john",
  "role": "user",
  "isActive": true,
  "canSubmit": false,
  "dailyDownloadLimit": 5,
  "activeTorrentLimit": 3,
  "maxTorrentSizeGb": 20,
  "privateTrackerLimit": 5,
  "downloadsToday": 2,
  "avatarUrl": "/avatars/uuid.jpg"
}
```

`avatarUrl` is `null` when no avatar is set.

---

## Download Limits

Get the current user's daily limit usage. `dailyUsed` counts all downloads created today except `failed` and `removed` ones; `todayPrivate` counts private tracker downloads created today.

```
GET /api/user/limits
```

### Response
```json
{
  "todayPrivate": 1,
  "privateLimit": 5,
  "dailyUsed": 2,
  "dailyLimit": 5
}
```

---

## Change Password

Change the current user's password. If the user is linked to Jellyfin, the new password is also synced there (plain text to Jellyfin first, then hashed locally).

```
POST /api/user/password
```

### Body
```json
{
  "currentPassword": "old-password",
  "newPassword": "new-password"
}
```

### Errors
| Code | Description |
|------|------------|
| 400 | Missing fields, new password under 8 chars, same as current, or invalid current password |
| 401 | Not authenticated |
| 404 | User not found |

### Response
```json
{ "success": true }
```

---

## Set Avatar

Generate an avatar with DiceBear and store it as a 512x512 JPG. The avatar is also synced to Jellyfin when the user is linked.

```
PUT /api/user/avatar
```

### Body
| Field | Type | Description |
|-------|------|-------------|
| `style` | string | Required. One of: `adventurer`, `avataaars`, `big-ears`, `bottts`, `fun-emoji`, `lorelei`, `micah`, `notionists`, `open-peeps`, `personas`, `pixel-art`, `toon-head` |
| `seed` | string | Required. Avatar seed (max 64 chars) |
| `bgColor` | string | Optional. One of the 15 supported background colors; falls back to the first color |

### Errors
| Code | Description |
|------|------------|
| 400 | Invalid style or seed |
| 401 | Not authenticated |

### Response
```json
{ "avatarUrl": "/avatars/uuid.jpg" }
```

---

## Upload Avatar

Upload a custom avatar image (multipart form data). The image is validated, resized to 512x512, and stored as JPEG. Also synced to Jellyfin when the user is linked.

```
POST /api/user/avatar/upload
Content-Type: multipart/form-data
```

### Body
| Field | Type | Description |
|-------|------|-------------|
| `avatar` | file | Required. JPEG, PNG, or WebP, max 5MB |

### Errors
| Code | Description |
|------|------------|
| 400 | Missing file, file over 5MB, or unsupported MIME type |
| 401 | Not authenticated |

### Response
```json
{ "avatarUrl": "/avatars/uuid.jpg" }
```

---

## Delete Avatar

Remove the current user's avatar (file, DB entry, and Jellyfin copy).

```
DELETE /api/user/avatar
```

### Response
```json
{ "success": true }
```
