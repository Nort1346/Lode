#!/usr/bin/env node

// Auto-create Jellyfin libraries (Movies + TV Shows) if they don't exist.
// Called from docker-entrypoint.sh on every container start.
// Idempotent - safe to run repeatedly.

const JELLYFIN_URL = (process.env.NUXT_JELLYFIN_URL || '').replace(/\/+$/, '')
const API_KEY = process.env.NUXT_JELLYFIN_API_KEY

if (!JELLYFIN_URL || !API_KEY) {
  console.log('[jellyfin-setup] No Jellyfin URL or API key configured, skipping.')
  process.exit(0)
}

const HEADERS = {
  Authorization: `MediaBrowser Token="${API_KEY}"`,
  'Content-Type': 'application/json'
}

const LIBRARIES = [
  { name: 'Movies', type: 'movies', path: '/media/Movies' },
  { name: 'TV Shows', type: 'tvshows', path: '/media/Series' }
]

async function waitForJellyfin(maxRetries = 30, interval = 2000) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const res = await fetch(`${JELLYFIN_URL}/Health`, { headers: HEADERS })
      if (res.ok) return true
    } catch {
      // not ready yet
    }
    await new Promise((r) => setTimeout(r, interval))
  }
  return false
}

async function getLibraries() {
  const res = await fetch(`${JELLYFIN_URL}/Library/VirtualFolders`, { headers: HEADERS })
  if (!res.ok) throw new Error(`Failed to fetch libraries: ${res.status}`)
  const data = await res.json()
  const libraries = Array.isArray(data) ? data : data.Items || []
  console.log(`[jellyfin-setup] Found ${libraries.length} existing libraries`)
  return libraries
}

async function createLibrary(name, collectionType, path) {
  const params = new URLSearchParams()
  params.set('name', name)
  params.set('collectionType', collectionType)
  params.set('refreshLibrary', 'false')

  const res = await fetch(`${JELLYFIN_URL}/Library/VirtualFolders?${params}`, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify({
      LibraryOptions: {
        PathInfos: [{ Path: path }]
      }
    })
  })
  return res.ok
}

async function main() {
  console.log('[jellyfin-setup] Waiting for Jellyfin...')

  const ready = await waitForJellyfin()
  if (!ready) {
    console.log('[jellyfin-setup] Jellyfin not reachable after timeout, skipping.')
    return
  }

  console.log('[jellyfin-setup] Jellyfin is ready.')

  let libraries
  try {
    libraries = await getLibraries()
  } catch (err) {
    console.log(`[jellyfin-setup] Could not fetch libraries: ${err.message} (Jellyfin may not be configured yet)`)
    return
  }

  if (libraries.length > 0) {
    console.log(`[jellyfin-setup] Found ${libraries.length} existing library(ies)  skipping creation.`)
    return
  }

  for (const { name, type, path } of LIBRARIES) {
    const ok = await createLibrary(name, type, path)
    if (ok) {
      console.log(`[jellyfin-setup] Created ${name} library (${path})`)
    } else {
      console.log(`[jellyfin-setup] Failed to create ${name} library`)
    }
  }

  console.log('[jellyfin-setup] Done.')
}

main().catch((err) => {
  console.error(`[jellyfin-setup] Error: ${err.message}`)
  // Never crash the container - this is best-effort setup
  process.exit(0)
})
