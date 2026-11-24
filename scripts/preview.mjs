#!/usr/bin/env node

import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

// Mirror scripts/start.mjs: alias the deprecated session secret at runtime so
// `nuxt preview` accepts existing deployments without baking it into the build.
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

const require = createRequire(import.meta.url)
const nuxtBin = join(dirname(require.resolve('nuxt/package.json')), 'bin', 'nuxt.mjs')

const child = spawn(process.execPath, [nuxtBin, 'preview', ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: process.env
})

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal)
  } else {
    process.exit(code ?? 1)
  }
})
