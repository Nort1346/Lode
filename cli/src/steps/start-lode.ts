import { ENV_FILE, ENV_KEYS, INTERNAL_URLS, PORTS, PORT_TIMEOUTS } from '../constants'
import { compose, dcCmdPrefix, logsTail, serviceRunning } from '../core/docker'
import { SetupFailure } from '../core/errors'
import { readEnvValue, updateEnv } from '../core/env'
import { hyperlink } from '../core/hyperlink'
import { spinner, stepHeader } from '../core/prompt'
import { sleep, waitForPort } from '../core/ports'
import type { StepContext } from '../types'

// First match wins: the password is printed once on first start, and a restart
// would print a stale value first in the tail.
export function extractAdminPassword(logs: string): string {
  for (const match of logs.matchAll(/Admin password:\s*([^\s"]+)/g)) {
    const value = match[1]
    if (value) return value
  }
  return ''
}

export async function startLode(ctx: StepContext): Promise<void> {
  stepHeader(15, 'Starting Lode')
  const dir = process.cwd()
  const files = ctx.composeFiles
  const { selection, urls } = ctx

  updateEnv(dir, ENV_FILE, ENV_KEYS.redisUrl, INTERNAL_URLS.redis)
  updateEnv(dir, ENV_FILE, ENV_KEYS.dbDriver, selection.dbDriver)
  updateEnv(
    dir,
    ENV_FILE,
    ENV_KEYS.qbittorrentUrl,
    selection.qbittorrent === 'local' ? INTERNAL_URLS.qbittorrent : urls.qbittorrent
  )
  updateEnv(
    dir,
    ENV_FILE,
    ENV_KEYS.prowlarrUrl,
    selection.prowlarr === 'local' ? INTERNAL_URLS.prowlarr : urls.prowlarr
  )
  updateEnv(
    dir,
    ENV_FILE,
    ENV_KEYS.jellyfinUrl,
    selection.mediaMode === 'local' ? INTERNAL_URLS.jellyfin : urls.jellyfin
  )
  updateEnv(dir, ENV_FILE, ENV_KEYS.flaresolverrUrl, selection.flaresolverr ? INTERNAL_URLS.flaresolverr : '')
  if (selection.dbDriver === 'postgres') {
    const pgPass = readEnvValue(dir, ENV_FILE, ENV_KEYS.postgresPassword)
    updateEnv(dir, ENV_FILE, ENV_KEYS.databaseUrl, `postgresql://lode:${pgPass}@postgres:5432/lode`)
  }

  // One spinner carries start + wait; it stops on the single completion line.
  const s = spinner()
  s.start('Starting Lode container...')
  await compose(files, 'up', '-d', 'lode')
  if (!(await serviceRunning(files, 'lode'))) {
    s.clear()
    throw new SetupFailure('Lode container failed to start.', [
      `Check logs:  ${dcCmdPrefix(files)} logs lode`,
      `To retry:    ${dcCmdPrefix(files)} up -d lode`
    ])
  }
  s.message('Waiting for Lode to start (first start may take 1-2 minutes)...')
  await waitForPort('localhost', PORTS.lode, PORT_TIMEOUTS.lode, {
    onTick: (attempt, maxAttempts) => s.message(`Waiting for Lode... (${attempt}/${maxAttempts})`)
  })
  s.stop(`Lode is running at ${hyperlink('http://localhost:5757')}`)

  // The admin password is printed once on first start; poll the logs until it appears.
  const credentials = spinner()
  credentials.start('Retrieving admin credentials...')
  for (let retry = 0; retry < 5; retry++) {
    ctx.adminPass = extractAdminPassword(await logsTail(files, 'lode', 200))
    if (ctx.adminPass) break
    await sleep(2000)
  }
  credentials.stop(ctx.adminPass ? 'Admin credentials ready' : 'Admin password not in logs yet')
}
