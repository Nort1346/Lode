#!/usr/bin/env node

// nuxt-auth-utils 0.6 no longer reads NUXT_SESSION_PASSWORD: sessions are sealed
// with Nuxt's appSecret (NUXT_APP_SECRET). Alias the deprecated variable so
// existing deployments keep working until it is renamed.
try {
  process.loadEnvFile()
} catch {
  /* no .env file */
}

const legacySecret = process.env.NUXT_SESSION_PASSWORD

if (legacySecret) {
  if (process.env.NUXT_APP_SECRET) {
    console.warn('[lode] NUXT_SESSION_PASSWORD is deprecated and ignored - remove it and keep NUXT_APP_SECRET only.')
  } else {
    process.env.NUXT_APP_SECRET = legacySecret
    console.warn(
      '[lode] NUXT_SESSION_PASSWORD is deprecated - using it as NUXT_APP_SECRET. Rename it in your environment.'
    )
  }
}

await import('../.output/server/index.mjs')
