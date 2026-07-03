# Auth API

## Login

Authenticate and create a session.

```
POST /api/auth/login
```

### Body
```json
{
  "username": "string",
  "password": "string"
}
```

### Response
```json
{
  "success": true,
  "user": {
    "id": "uuid",
    "username": "admin",
    "role": "admin"
  }
}
```

### Errors
| Code | Description |
|------|------------|
| 400 | Missing username or password |
| 401 | Invalid credentials |
| 403 | Account expired or deactivated |

---

## Logout

Destroy the current session.

```
POST /api/auth/logout
```

### Response
```json
{ "success": true }
```

---

## Register

Create a new user (admin only).

```
POST /api/auth/register
```

### Body
```json
{
  "username": "string",
  "password": "string",
  "role": "user",
  "dailyDownloadLimit": 5,
  "activeTorrentLimit": 3,
  "maxTorrentSizeGb": 20,
  "jellyfinLibraryAccess": "all",
  "jellyfinEnableVideoTranscoding": true,
  "jellyfinEnableAudioTranscoding": true,
  "jellyfinEnableRemuxing": true,
  "jellyfinEnableLiveTvAccess": true,
  "jellyfinEnableLiveTvManagement": false,
  "jellyfinMaxActiveSessions": 0
}
```

### Response
```json
{ "success": true, "id": "uuid" }
```

### Errors
| Code | Description |
|------|------------|
| 400 | Missing username or password |
| 401 | Not authenticated |
| 403 | Not admin |
| 409 | Username already exists |

---

## Get Current User

Returns the authenticated user's info from the session.

```
GET /api/auth/me
```

### Response
```json
{
  "user": {
    "id": "uuid",
    "username": "admin",
    "role": "admin",
    "isActive": true,
    "dailyDownloadLimit": 5,
    "activeTorrentLimit": 3,
    "maxTorrentSizeGb": 20,
    "privateTrackerLimit": 5,
    "downloadsToday": 0
  }
}
```
