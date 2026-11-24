# PWA

## Overview

Lode is a Progressive Web App (PWA) with install prompts, auto-updates, and a native-like (standalone) experience.

## Configuration

Via `@vite-pwa/nuxt` (now `^2.0.2`, was 1.1.1) in `nuxt.config.ts`:

```ts
pwa: {
  registerType: 'autoUpdate',
  manifest: {
    name: 'Lode',
    short_name: 'Lode',
    description: 'Browse, request, and download movies & TV shows',
    theme_color: '#f59e0b',
    background_color: '#09090b',
    display: 'standalone',
    start_url: '/dashboard',
    scope: '/',
    icons: [
      { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
      { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
      { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
      { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
    ]
  },
  strategies: 'injectManifest',
  injectManifest: {
    swSrc: 'public/sw.js',
    globPatterns: ['**/*.{js,css,ico,png,svg,woff2}']
  },
  devOptions: {
    enabled: import.meta.dev
  },
  pwaAssets: {
    config: true
  },
  client: {
    installPrompt: true,
    periodicSyncForUpdates: 3600
  }
}
```

## Features

### Auto-Update
- Service worker updates automatically in background
- No user intervention needed
- New content available immediately

### Icons
| Size | Purpose |
|------|---------|
| 64x64 | Favicon, small displays |
| 192x192 | Android home screen |
| 512x512 | Splash screen, Android |
| 512x512 maskable | Android adaptive icon |

### Service Worker
- Caches static assets (JS, CSS, images, fonts)
- Periodic sync every 3600 seconds

### Install Prompts

**Desktop**: Standard browser install prompt via `PwaInstallPrompt` component

**iOS**: Custom banner via `PwaIOSInstallBanner` component (iOS doesn't support standard prompt)

## Push Notifications

See [Notifications](./notifications.md) for push notification setup.

### Service Worker (`/sw.js` and `/sw-push.js`)

`@vite-pwa/nuxt` v2 no longer accepts `importScripts` in the plugin options. The registered worker is
now a custom `public/sw.js` generated with the `injectManifest` strategy: it precaches the injected
manifest and removes stale caches. It applies updates immediately via `skipWaiting` (on install and
on a `SKIP_WAITING` message) and `clients.claim` on activate. It loads the push handlers with
`importScripts('./sw-push.js')`, so the same `public/sw-push.js` file:

- Handles push events and displays notifications with an icon
- Opens the relevant page on click
- Re-subscribes with the current VAPID key on `pushsubscriptionchange`

## Connectivity

Lode requires an active internet connection. It depends on the Lode backend and the connected services (Prowlarr, qBittorrent, Jellyfin, TMDB), none of which work offline.

- The service worker **pre-caches static build assets** (JS, CSS, images, fonts) so repeat loads are fast.
- There is **no offline data or API caching** and no offline fallback page.
- The app **does not function offline** - browsing, requests, downloads, and push notifications all require the backend to be reachable.
