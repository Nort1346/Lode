# Requests & Wishlist

## Overview

Users can request media content and maintain a wishlist. Admins review requests and decide to accept or reject them.

## Request Flow

### Creating a Request
1. User navigates to movie/TV detail page
2. Clicks "Request" button
3. Optionally adds a note
4. Request created with `pending` status
5. In-app notification sent to admins
6. Discord notification sent (if configured)

### Admin Review
1. Admin navigates to Admin → Requests
2. Views pending requests with media info and user notes
3. Accepts or rejects with optional admin note
4. Status updated to `accepted` or `rejected`
5. In-app notification sent to requesting user
6. Discord notification sent (if configured)

## Request Visibility Rules

### Request Carousel (`/dashboard`)
Shows recent requests from the last 30 days with specific visibility rules:

| Status | Visibility |
|--------|-----------|
| `pending` | Always visible |
| `accepted` | Visible for 30 days |
| `rejected` | Visible for 30 days |

**Sort order**: pending → rejected → accepted (most recent first within each group)

After 30 days, accepted and rejected requests are hidden from the carousel but remain in the database.

### Requests Page (`/admin/requests`)
- Admin-only page
- Shows ALL requests (no time filter)
- Filterable by status
- Paginated

## Wishlist

### Adding to Wishlist
1. User browses media content
2. Clicks "Add to Wishlist" button
3. Item saved with media type, ID, title, and poster
4. Duplicate check prevents re-adding

### Removing from Wishlist
- Remove by wishlist item ID
- Remove by media type + media ID
- Only own wishlist items can be removed

### Wishlist Check
- `GET /api/wishlist/check?mediaType=movie&mediaId=123`
- Returns `{ wishlisted: boolean, id: string | null }`
- Used to show correct button state on detail pages

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/requests/post` | POST | Create request |
| `/api/requests/list` | GET | List all requests (admin) |
| `/api/requests/mine` | GET | List own requests (30-day carousel) |
| `/api/requests/my` | GET | List all own requests |
| `/api/requests/[id]` | PATCH | Accept/reject request (admin) |
| `/api/wishlist` | GET | List own wishlist |
| `/api/wishlist` | POST | Add to wishlist |
| `/api/wishlist` | DELETE | Remove from wishlist |
| `/api/wishlist/check` | GET | Check if media is wishlisted |
