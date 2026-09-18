import {
  compose,
  containerExists,
  dcCmdPrefix,
  imageExists,
  logsTail,
  serviceLastLogLine,
  serviceRunning,
  stopAndRemoveContainer
} from '../core/docker'
import { SetupFailure } from '../core/errors'
import { askConfirm, log, stepHeader, withSpinner } from '../core/prompt'
import { sleep, waitForPort } from '../core/ports'
import { infraServicesFor, LODE_IMAGE, PORTS, PORT_TIMEOUTS } from '../constants'
import type { SetupSelection, StepContext } from '../types'

const QBIT_TEMP_PASSWORD = /A temporary password is provided for this session:\s*(\S+)/g

export function extractQbitTempPassword(logs: string): string {
  let last = ''
  for (const match of logs.matchAll(QBIT_TEMP_PASSWORD)) last = match[1] ?? ''
  return last
}

interface DeselectionCheck {
  service: string
  stateKey: keyof SetupSelection
  activeValue: string
}

const DESELECTION_CHECKS: readonly DeselectionCheck[] = [
  { service: 'qbittorrent', stateKey: 'qbittorrent', activeValue: 'local' },
  { service: 'prowlarr', stateKey: 'prowlarr', activeValue: 'local' },
  { service: 'jellyfin', stateKey: 'mediaMode', activeValue: 'local' },
  { service: 'flaresolverr', stateKey: 'flaresolverr', activeValue: 'true' },
  { service: 'dozzle', stateKey: 'dozzle', activeValue: 'true' },
  { service: 'postgres', stateKey: 'dbDriver', activeValue: 'postgres' }
]

async function removeDeselectedServices(ctx: StepContext): Promise<void> {
  const previous = ctx.previousSelection
  if (!previous) return
  for (const check of DESELECTION_CHECKS) {
    if (String(previous[check.stateKey]) !== check.activeValue) continue
    if (String(ctx.selection[check.stateKey]) === check.activeValue) continue
    const container = `lode-${check.service}`
    if (!(await containerExists(container))) continue
    const remove = await askConfirm(
      `${container} is no longer selected. Stop and remove the container? (its volume is kept)`,
      true
    )
    if (remove) {
      await stopAndRemoveContainer(container)
      log.success(`Removed ${container} (volume kept)`)
    } else {
      log.warn(`Keeping ${container} - remove it manually with: docker rm ${container}`)
    }
  }
}

async function waitReady(label: string, port: number, timeoutMs: number): Promise<void> {
  log.info(`Waiting for ${label}...`)
  await withSpinner(`Waiting for ${label} on port ${port}...`, (update) =>
    waitForPort('localhost', port, timeoutMs, {
      onTick: (attempt, maxAttempts) => update(`Waiting for ${label}... (${attempt}/${maxAttempts})`)
    })
  )
}

export async function startServices(ctx: StepContext): Promise<void> {
  stepHeader(9, 'Starting selected services')
  const files = ctx.composeFiles

  const config = await compose(files, 'config', '-q')
  if (config.code !== 0) {
    throw new SetupFailure('The selected compose files do not merge correctly.', [`Files: ${files.join(' ')}`])
  }

  if (ctx.stateFound) await removeDeselectedServices(ctx)

  const services = infraServicesFor(ctx.selection)

  await withSpinner('Pulling images...', () => compose(files, 'pull'))
  if (!(await imageExists(ctx.selection.imageTag))) {
    throw new SetupFailure(
      `Failed to pull the Lode image (${LODE_IMAGE}:${ctx.selection.imageTag}). Check your network and try again.`,
      [`You can also try manually: ${dcCmdPrefix(files)} pull lode`]
    )
  }

  await withSpinner('Starting selected services...', () => compose(files, 'up', '-d', ...services))

  const failed: string[] = []
  for (const service of services) {
    if (await serviceRunning(files, service)) continue
    failed.push(service)
    log.warn(`${service} failed to start: ${await serviceLastLogLine(files, service)}`)
  }

  if (failed.includes('redis')) {
    throw new SetupFailure('Redis failed to start. Cannot continue.', [`Check logs: ${dcCmdPrefix(files)} logs redis`])
  }
  if (ctx.selection.dbDriver === 'postgres' && failed.includes('postgres')) {
    throw new SetupFailure('PostgreSQL failed to start. Cannot continue.', [
      `Check logs: ${dcCmdPrefix(files)} logs postgres`
    ])
  }
  if (ctx.selection.qbittorrent === 'local' && failed.includes('qbittorrent')) {
    throw new SetupFailure('qBittorrent failed to start. Cannot continue.', [
      `Check logs: ${dcCmdPrefix(files)} logs qbittorrent`
    ])
  }

  await waitReady('Redis', PORTS.redis, PORT_TIMEOUTS.redis)

  if (ctx.selection.qbittorrent === 'local')
    await waitReady('qBittorrent', PORTS.qbittorrent, PORT_TIMEOUTS.qbittorrent)

  await sleep(3000)
  if (ctx.selection.qbittorrent === 'local') {
    ctx.qbitTempPass = extractQbitTempPassword(await logsTail(files, 'qbittorrent', 100_000))
  }

  if (ctx.selection.prowlarr === 'local') {
    if (failed.includes('prowlarr')) {
      log.warn('Prowlarr not running - you can configure it later (step 12)')
    } else {
      await waitReady('Prowlarr', PORTS.prowlarr, PORT_TIMEOUTS.prowlarr)
    }
  }

  if (ctx.selection.mediaMode === 'local') {
    if (failed.includes('jellyfin')) {
      log.warn('Jellyfin not running - you can configure it later (step 10)')
    } else {
      await waitReady('Jellyfin', PORTS.jellyfin, PORT_TIMEOUTS.jellyfin)
    }
  }

  log.success('Selected services are running')

  if (ctx.selection.dbDriver === 'postgres') await waitReady('PostgreSQL', PORTS.postgres, PORT_TIMEOUTS.postgres)

  log.info('Waiting 10s for services to fully initialize...')
  await withSpinner('Settling services...', () => sleep(10_000))
}
