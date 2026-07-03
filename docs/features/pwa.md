# PWA

## Overview

StreamHub is a Progressive Web App (PWA) with offline support, install prompts, and native-like experience.

## Configuration

Via `@vite-pwa/nuxt` in `nuxt.config.ts`:

```ts
pwa: {
  registerType: 'autoUpdate',
  manifest: {
    name: 'StreamHub',
    short_name: 'StreamHub',
    description: 'Browse, request, and download movies & TV shows',
    theme_color: '#f59e0b',
    background_color: '#09090b',
    display: 'standalone',
    start_url: '/dashboard',
    icons: [
      { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
      { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
      { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
      { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
    ]
  },
  workbox: {
    globPatterns: ['**/*.{js,css,ico,png,svg,woff2}'],
    importScripts: ['/sw-push.js']
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
- Import push notification script (`/sw-push.js`)
- Periodic sync every 3600 seconds

### Install Prompts

**Desktop**: Standard browser install prompt via `PwaInstallPrompt` component

**iOS**: Custom banner via `PwaIOSInstallBanner` component (iOS doesn't support standard prompt)

## Push Notifications

See [Notifications](./notifications.md) for push notification setup.

### Service Worker (`/sw-push.js`)
- Handles push events
- Displays notifications with icon and badge
- Click handler opens relevant page

## Offline Behavior

- Static assets cached by service worker
- API calls require network (not cached)
- Login page available offline (cached)
- Dashboard shows cached content when offline
