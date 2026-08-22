# Browse & Search

## Overview

The Browse section is the main content discovery interface, powered by TMDB with Prowlarr torrent search integration.

## Pages

- **`/browse`** - Main browse page with carousels, spotlights, and search
- **`/browse/movie/[id]`** - Movie detail with torrent list and download
- **`/browse/tv/[id]`** - TV show detail with season/episode navigation

## Carousels

### Popular Movies & TV Shows
- Fetched from TMDB's `/movie/popular` and `/tv/popular` endpoints
- 20 items per carousel
- Horizontal scroll with overflow detection (`useCarouselOverflow`)
- Arrow buttons appear when content overflows

### Trending
- TMDB `/trending/all/week` - movies and TV shows mixed
- 20 items with logo overlay (TMDB image API)
- Backdrop images with gradient overlay

### Top Rated
- TMDB `/movie/top_rated`
- 20 highest-rated movies

### Genre Discovery
- Filtered carousels by genre ID
- Supports both movie and TV genres simultaneously
- Results deduplicated and sorted by rating
- Cached (TTL: 6 hours; Redis when `NUXT_REDIS_URL` is set, no-op otherwise)

## Spotlights

The spotlight carousel displays items from 5 randomly selected genres out of a pool of 14 entries (8 movie, 6 TV). The pool is shuffled with the Fisher-Yates algorithm and cached for 6 hours, so the selection changes when the cache expires - not on every page load.

**Genre pool**:

| Type | Genres |
|------|--------|
| Movie | Action, Adventure, Comedy, Drama, Sci-Fi, Horror, Thriller, Animation |
| TV | Action & Adventure, Comedy, Drama, News, Crime, Kids |

Spotlights use full-width backdrop images without a logo overlay (`logoUrl` is always `null`) and do NOT show in-library badges.

## Search

- Minimum 2 characters
- Searches movies and/or TV shows from TMDB
- Filter by type (`movie`, `tv`, `all`)
- Filter by genre IDs (comma-separated)
- Results sorted by rating
- Supports pagination

## In-Library Detection

All browse results (except spotlights) are checked against Jellyfin libraries using `markInLibrary()`:

```ts
async function markInLibrary<T extends { id: number }>(
  items: T[],
  provider?: SyncProvider
): Promise<(T & { inLibrary: boolean })[]>
```

- `BrowseItem` does NOT have `inLibrary` - it's added via intersection type
- `SpotlightItem` has `inLibrary: boolean` (always `false` - not used)
- Provider lookup uses a cached in-flight promise to prevent race conditions
- If Jellyfin is not configured, all items show `inLibrary: false`

## Reveal Animations

All carousels are animated with the globally registered `v-reveal` Vue directive (IntersectionObserver based):

- **Usage**: Add `v-reveal` to any element to animate it on scroll. Pass a number (`v-reveal="2"` or `v-reveal="3"`) to apply a staggered delay class (`reveal-delay-2` / `reveal-delay-3`).
- **Behavior**: Adds the `reveal` class on mount. When the element scrolls into view (root margin `100px`, before fully visible) the `revealed` class is added and the observer disconnects (one-shot).
- **SSR-safe**: The directive is registered in `app/plugins/directives.ts` and exposes `getSSRProps()` so it renders without crashing during server-side rendering.
- **CSS-based**: Uses `.reveal` / `.revealed` CSS classes (defined in `app/assets/css/main.css`).
- **Zero dependencies**: Pure IntersectionObserver + CSS, no GSAP.

## TMDB Locale

Search results are localized based on the current i18n locale:
- `pl` → Polish titles and overviews
- `en` → English titles and overviews

The locale is passed as a query parameter to all browse API endpoints.
