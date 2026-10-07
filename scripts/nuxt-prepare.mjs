import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'

// In the Docker deps/build stages, `pnpm install` runs before `COPY . .`, so the
// project source is absent. Without nuxt.config.ts, Nuxt auto-enables devtools,
// whose top-level simple-git import breaks `nuxt prepare` (simple-git 4.x is
// ESM-only, no default export). Skip prepare there - the build stage regenerates
// everything via `pnpm run build`.
if (!existsSync('nuxt.config.ts')) process.exit(0)

const result = spawnSync('nuxt', ['prepare'], { stdio: 'inherit', shell: process.platform === 'win32' })
process.exit(result.status ?? 1)
