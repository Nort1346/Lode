#!/usr/bin/env node

// Auto-create Plex libraries (Movies + TV Shows) if they don't exist.
// Called from docker-entrypoint.sh on every container start.
// Idempotent - safe to run repeatedly. Best-effort: never fails the container.

const PLEX_URL = (process.env.NUXT_PLEX_URL || '').replace(/\/+$/, '')
const TOKEN = process.env.NUXT_PLEX_TOKEN

if (!PLEX_URL || !TOKEN) {
  console.log('[plex-setup] No Plex URL or token configured, skipping.')
  process.exit(0)
}

const HEADERS = {
  'X-Plex-Token': TOKEN,
  Accept: 'application/json',
  'X-Plex-Product': 'Lode',
  'X-Plex-Client-Identifier': 'lode-setup'
}

// Plex section agents differ between PMS generations - try the current
// tv.plex.agents.* pair first, then fall back to the legacy agents.
const SECTIONS = [
  { name: 'Movies', type: 'movie', path: '/media/Movies', agent: 'tv.plex.agents.movie', scanner: 'Plex Movie' },
  {
    name: 'TV Shows',
    type: 'show',
    path: '/media/Series',
    agent: 'tv.plex.agents.series',
    scanner: 'Plex Series'
  }
]

const LEGACY_AGENTS = {
  movie: { agent: 'com.plexapp.agents.imdb', scanner: 'Plex Movie' },
  show: { agent: 'com.plexapp.agents.thetvdb', scanner: 'Plex Series' }
}

async function waitForPlex(maxRetries = 45, interval = 2000) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const res = await fetch(`${PLEX_URL}/identity`, { headers: HEADERS })
      if (res.ok) return true
    } catch {
      // not ready yet
    }
    await new Promise((r) => setTimeout(r, interval))
  }
  return false
}

async function getSections() {
  const res = await fetch(`${PLEX_URL}/library/sections`, { headers: HEADERS })
  if (!res.ok) throw new Error(`Failed to fetch sections: ${res.status}`)
  const data = await res.json()
  const dirs = data?.MediaContainer?.Directory ?? []
  console.log(`[plex-setup] Found ${dirs.length} existing section(s)`)
  return Array.isArray(dirs) ? dirs : []
}

async function createSection(name, type, agent, scanner) {
  const params = new URLSearchParams()
  params.set('name', name)
  params.set('type', type)
  params.set('agent', agent)
  params.set('scanner', scanner)
  params.set('language', 'en')

  const res = await fetch(`${PLEX_URL}/library/sections?${params}`, { method: 'POST', headers: HEADERS })
  if (res.ok) return true
  // Older PMS builds reject the current agents - retry with the legacy pair.
  const legacy = LEGACY_AGENTS[type]
  if (!legacy) return false
  params.set('agent', legacy.agent)
  params.set('scanner', legacy.scanner)
  const retry = await fetch(`${PLEX_URL}/library/sections?${params}`, { method: 'POST', headers: HEADERS })
  return retry.ok
}

async function addSectionPath(key, path) {
  const params = new URLSearchParams()
  params.set('path', path)
  const res = await fetch(`${PLEX_URL}/library/sections/${key}/add?${params}`, { method: 'POST', headers: HEADERS })
  if (!res.ok) {
    console.log(`[plex-setup] Could not add path ${path} to section ${key}: ${res.status}`)
  }
  return res.ok
}

// JSON sections carry their folders in DirectoryLocation: [{ path }]
function sectionPaths(dir) {
  const locations = dir?.DirectoryLocation
  if (!Array.isArray(locations)) return []
  return locations.map((loc) => loc?.path).filter((p) => typeof p === 'string')
}

async function main() {
  console.log('[plex-setup] Waiting for Plex Media Server...')

  const ready = await waitForPlex()
  if (!ready) {
    console.log('[plex-setup] Plex not reachable after timeout, skipping.')
    return
  }

  console.log('[plex-setup] Plex is ready.')

  let sections
  try {
    sections = await getSections()
  } catch (err) {
    console.log(`[plex-setup] Could not fetch sections: ${err.message} (token may be invalid)`)
    return
  }

  for (const section of SECTIONS) {
    const existing = sections.find((s) => s.title === section.name)
    if (existing) {
      // Only add the folder when the section does not have it yet.
      if (!sectionPaths(existing).includes(section.path)) {
        await addSectionPath(existing.key, section.path)
      }
      continue
    }

    const created = await createSection(section.name, section.type, section.agent, section.scanner)
    if (!created) {
      console.log(`[plex-setup] Failed to create ${section.name} section`)
      continue
    }

    // The new section's key is the highest numeric key PMS handed out.
    const refreshed = await getSections().catch(() => [])
    const createdSection = refreshed.find((s) => s.title === section.name)
    if (createdSection) {
      await addSectionPath(createdSection.key, section.path)
      console.log(`[plex-setup] Created ${section.name} section (${section.path})`)
    }
  }

  console.log('[plex-setup] Done.')
}

main().catch((err) => {
  console.error(`[plex-setup] Error: ${err.message}`)
  // Never crash the container - this is best-effort setup
  process.exit(0)
})
