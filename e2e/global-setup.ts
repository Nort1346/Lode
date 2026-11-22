// Playwright globalSetup: provisions a fully isolated E2E environment.
//
// 1. Wipes and recreates the isolated data directory (.data-e2e)
// 2. Runs the database migrations against it (DB_DATA_DIR override)
// 3. Seeds the known E2E users (e2e/seed.ts)
// 4. Starts the mock TMDB server (e2e/mock-tmdb.ts) on a free port
// 5. Starts the Nuxt dev server with hermetic env (no Prowlarr/qBittorrent/
//    Jellyfin/Redis/Discord, dead ports for the download stack)
// 6. Waits until the app answers, then records PIDs in .data-e2e/e2e-state.json
//
// global-teardown.ts kills everything that was started here.

import { execFileSync, spawn, type ChildProcess } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { openSync, rmSync, writeFileSync, readFileSync } from 'node:fs'
import { createConnection } from 'node:net'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DATA_DIR_NAME = '.data-e2e'
const DATA_DIR = join(repoRoot, DATA_DIR_NAME)
const STATE_FILE = join(DATA_DIR, 'e2e-state.json')
const APP_LOG_FILE = join(DATA_DIR, 'dev-server.log')
const MOCK_LOG_FILE = join(DATA_DIR, 'mock-tmdb.log')

// Dedicated E2E port (the dev server uses 5757) so the suite never collides
// with a locally running `pnpm dev`.
const APP_PORT = 5758
const BASE_URL = `http://127.0.0.1:${APP_PORT}`
const READINESS_TIMEOUT_MS = 300_000
const READINESS_POLL_MS = 2_000
const IS_WINDOWS = process.platform === 'win32'

interface E2EState {
  appPid: number | null
  tmdbPid: number | null
  tmdbPort: number
}

function run(cmd: string, args: string[], env: NodeJS.ProcessEnv): void {
  try {
    execFileSync(cmd, args, { cwd: repoRoot, env, stdio: 'inherit' })
  } catch {
    throw new Error(`E2E setup failed: ${cmd} ${args.join(' ')} exited non-zero (see output above)`)
  }
}

function logTail(file: string, lines = 40): string {
  try {
    return readFileSync(file, 'utf8')
      .split('\n')
      .slice(-lines)
      .join('\n')
  } catch {
    return '<no log file>'
  }
}

function portInUse(port: number): Promise<boolean> {
  // A successful connection means something else owns the port.
  return new Promise((resolvePromise) => {
    const socket = createConnection({ host: '127.0.0.1', port, timeout: 500 })
    socket.once('connect', () => {
      socket.destroy()
      resolvePromise(true)
    })
    socket.once('error', () => {
      socket.destroy()
      resolvePromise(false)
    })
    socket.once('timeout', () => {
      socket.destroy()
      resolvePromise(false)
    })
  })
}

async function waitForHttp(url: string, timeoutMs: number, isAlive: () => boolean): Promise<void> {
  const deadline = Date.now() + timeoutMs
  let lastError = ''
  while (Date.now() < deadline) {
    if (!isAlive()) {
      throw new Error(`E2E server died during startup.\n--- tail of ${APP_LOG_FILE} ---\n${logTail(APP_LOG_FILE)}`)
    }
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(5_000) })
      if (res.status < 500) return
      lastError = `HTTP ${res.status}`
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err)
    }
    await new Promise((r) => setTimeout(r, READINESS_POLL_MS))
  }
  throw new Error(`E2E server did not become ready at ${url} within ${timeoutMs / 1000}s (last: ${lastError}).\n--- tail of ${APP_LOG_FILE} ---\n${logTail(APP_LOG_FILE)}`)
}

export default async function globalSetup(): Promise<void> {
  rmSync(DATA_DIR, { recursive: true, force: true })

  if (await portInUse(APP_PORT)) {
    throw new Error(
      `Port ${APP_PORT} is already in use - a stale E2E server is probably still running. ` +
        'Find it (netstat -ano | findstr :5758 / Windows, lsof -i :5758 / Linux) and kill it, then rerun.'
    )
  }

  const baseEnv: NodeJS.ProcessEnv = {
    ...process.env,
    DB_DRIVER: 'sqlite',
    DB_DATA_DIR: DATA_DIR,
    TZ: 'UTC'
  }

  console.log('[e2e] running database migrations...')
  run(process.execPath, ['scripts/migrate.mjs'], baseEnv)

  console.log('[e2e] seeding E2E users...')
  run(process.execPath, ['e2e/seed.ts'], baseEnv)

  // --- Mock TMDB server -------------------------------------------------
  const mockLog = openSync(MOCK_LOG_FILE, 'w')
  const tmdb = spawn(process.execPath, ['e2e/mock-tmdb.ts'], {
    cwd: repoRoot,
    env: baseEnv,
    stdio: ['ignore', 'pipe', mockLog],
    detached: !IS_WINDOWS
  })
  tmdb.unref()

  let tmdbPort: number
  try {
    tmdbPort = await new Promise<number>((resolvePort, rejectPort) => {
      const timer = setTimeout(() => rejectPort(new Error('mock TMDB did not start within 15s')), 15_000)
      tmdb.stdout?.on('data', (chunk: Buffer) => {
        for (const line of chunk.toString().split('\n')) {
          const match = /^LISTENING (\d+)$/.exec(line.trim())
          if (match !== null && match[1] !== undefined) {
            clearTimeout(timer)
            resolvePort(Number(match[1]))
            return
          }
        }
      })
      tmdb.on('error', (err) => {
        clearTimeout(timer)
        rejectPort(err)
      })
      tmdb.on('exit', (code) => {
        clearTimeout(timer)
        rejectPort(new Error(`mock TMDB exited early (code ${code})\n${logTail(MOCK_LOG_FILE, 20)}`))
      })
    })
  } catch (err) {
    killProcess(tmdb)
    throw err
  }

  console.log(`[e2e] mock TMDB listening on 127.0.0.1:${tmdbPort}`)

  // --- Nuxt dev server --------------------------------------------------
  const appLog = openSync(APP_LOG_FILE, 'w')
  const app = spawn('pnpm', ['run', 'dev'], {
    cwd: repoRoot,
    env: {
      ...baseEnv,
      PORT: String(APP_PORT),
      HOST: '127.0.0.1',
      NUXT_TELEMETRY_DISABLED: '1',
      NUXT_APP_SECRET: randomBytes(32).toString('hex'),
      NUXT_TRACKER_ENCRYPTION_KEY: randomBytes(32).toString('hex'),
      // TMDB pointed at the local mock; every other external service is
      // pointed at a dead port (or left unconfigured) so the suite is hermetic.
      NUXT_TMDB_BASE_URL: `http://127.0.0.1:${tmdbPort}`,
      NUXT_QBITTORRENT_URL: 'http://127.0.0.1:9',
      NUXT_QBITTORRENT_API_KEY: '',
      NUXT_PROWLARR_URL: 'http://127.0.0.1:9',
      NUXT_PROWLARR_API_KEY: '',
      NUXT_JELLYFIN_URL: '',
      NUXT_JELLYFIN_API_KEY: '',
      NUXT_REDIS_URL: '',
      NUXT_DISCORD_WEBHOOK_URL: '',
      NUXT_FLARESOLVERR_URL: '',
      NUXT_DISKS: '',
      NUXT_DISK_SPACE_CHECK_ENABLED: 'false',
      NUXT_TORRENT_SYNC_INTERVAL_MS: '3600000',
      NUXT_SAVE_PATH_MOVIES: join(DATA_DIR, 'save', 'Movies'),
      NUXT_SAVE_PATH_SERIES: join(DATA_DIR, 'save', 'Series')
    },
    stdio: ['ignore', appLog, appLog],
    shell: IS_WINDOWS,
    detached: !IS_WINDOWS
  })
  app.unref()

  console.log(`[e2e] waiting for the app at ${BASE_URL} (log: ${APP_LOG_FILE})...`)
  try {
    await waitForHttp(`${BASE_URL}/login`, READINESS_TIMEOUT_MS, () => app.exitCode === null)
  } catch (err) {
    killProcess(app)
    killProcess(tmdb)
    throw err
  }

  const state: E2EState = {
    appPid: app.pid ?? null,
    tmdbPid: tmdb.pid ?? null,
    tmdbPort
  }
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2))
  console.log(`[e2e] ready: app pid ${state.appPid}, mock TMDB pid ${state.tmdbPid} (port ${state.tmdbPort})`)
}

export function killProcess(child: ChildProcess): void {
  if (child.pid === undefined || child.pid === null) return
  if (IS_WINDOWS) {
    try {
      execFileSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' })
    } catch {
      // Already gone
    }
    return
  }
  // POSIX: the children were spawned with detached: true, so they are the
  // leaders of their own process groups - kill the whole group.
  for (const signal of ['SIGTERM', 'SIGKILL'] as const) {
    try {
      process.kill(-child.pid, signal)
      if (signal === 'SIGKILL') break
    } catch {
      break
    }
  }
}
