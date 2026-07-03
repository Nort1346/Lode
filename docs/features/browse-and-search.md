# Browse & Search

## Overview

The Browse section is the main content discovery interface, powered by TMDB with Prowlarr torrent search integration.

## Pages

- **`/browse`** — Main browse page with carousels, spotlights, and search
- **`/browse/movie/[id]`** — Movie detail with torrent list and download
- **`/browse/tv/[id]`** — TV show detail with season/episode navigation

## Carousels

### Popular Movies & TV Shows
- Fetched from TMDB's `/movie/popular` and `/tv/popular` endpoints
- 20 items per carousel
- Horizontal scroll with overflow detection (`useCarouselOverflow`)
- Arrow buttons appear when content overflows

### Trending
- TMDB `/trending/all/week` — movies and TV shows mixed
- 20 items with logo overlay (TMDB image API)
- Backdrop images with gradient overlay

### Top Rated
- TMDB `/movie/top_rated`
- 20 highest-rated movies

### Genre Discovery
- Filtered carousels by genre ID
- Supports both movie and TV genres simultaneously
- Results deduplicated and sorted by rating
- Cached in Redis (TTL: 60 minutes)

## Spotlights

The spotlight carousel displays 5 randomly selected items from a pool of 14 genres (7 movie, 7 TV). The pool is shuffled using Fisher-Yates algorithm, and items are re-shuffled on each page load.

**Genre pool**: Action, Adventure, Comedy, Drama, Sci-Fi, Horror, Thriller, Animation, Western, War, Crime, Mystery

Spotlights use full-width backdrop images with logo overlay and do NOT show in-library badges.

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

- `BrowseItem` does NOT have `inLibrary` — it's added via intersection type
- `SpotlightItem` has `inLibrary: boolean` (always `false` — not used)
- Provider lookup uses a cached in-flight promise to prevent race conditions
- If Jellyfin is not configured, all items show `inLibrary: false`

## Reveal Animations

All carousels use `useReveal()` composable with IntersectionObserver:

- **Root margin**: `100px` (triggers before element is fully visible)
- **One-shot**: Observer disconnects after first intersection
- **CSS-based**: Uses `.hero-fade-in` and `.reveal` CSS animations
- **Zero dependencies**: Pure IntersectionObserver + CSS, no GSAP

## TMDB Locale

Search results are localized based on the current i18n locale:
- `pl` → Polish titles and overviews
- `en` → English titles and overviews

The locale is passed as a query parameter to all browse API endpoints.
