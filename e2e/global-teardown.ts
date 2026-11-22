// Playwright globalTeardown: kills the app dev server and the mock TMDB
// server started by global-setup.ts (best effort - CI runners are ephemeral,
// locally we do our best not to leave processes behind).

import { existsSync, readFileSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { killProcess } from './global-setup.ts'
import type { ChildProcess } from 'node:child_process'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const STATE_FILE = join(repoRoot, '.data-e2e', 'e2e-state.json')

interface E2EState {
  appPid: number | null
  tmdbPid: number | null
  tmdbPort: number
}

// Reconstruct a minimal ChildProcess-shaped object from a stored PID so the
// shared killProcess() helper (group kill on POSIX, taskkill /T on Windows)
// can be reused.
function pidAsChild(pid: number): ChildProcess {
  return { pid } as ChildProcess
}

export default async function globalTeardown(): Promise<void> {
  if (!existsSync(STATE_FILE)) {
    console.log('[e2e] no state file found - nothing to tear down')
    return
  }

  let state: E2EState
  try {
    state = JSON.parse(readFileSync(STATE_FILE, 'utf8')) as E2EState
  } catch (err) {
    console.error(`[e2e] failed to read state file, skipping teardown: ${err instanceof Error ? err.message : String(err)}`)
    return
  }

  // App first, mock second (order is cosmetic, both are independent).
  if (state.appPid !== null) {
    console.log(`[e2e] stopping app server (pid ${state.appPid})`)
    killProcess(pidAsChild(state.appPid))
  }
  if (state.tmdbPid !== null) {
    console.log(`[e2e] stopping mock TMDB (pid ${state.tmdbPid})`)
    killProcess(pidAsChild(state.tmdbPid))
  }
}
