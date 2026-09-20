import {
  compose,
  composeOnLine,
  containerExists,
  dcCmdPrefix,
  imageExists,
  logsTail,
  serviceLastLogLine,
  serviceRunning,
  stopAndRemoveContainer
} from '../core/docker'
import { SetupFailure } from '../core/errors'
import { askConfirm, log, spinner, stepHeader } from '../core/prompt'
import { sleep, waitForPort } from '../core/ports'
import { infraServicesFor, LODE_IMAGE, PORTS, PORT_TIMEOUTS, serviceDisplayName } from '../constants'
import type { DeselectionCheck, StepContext, WaitPhase } from '../types'

const QBIT_TEMP_PASSWORD = /A temporary password is provided for this session:\s*(\S+)/g

export function extractQbitTempPassword(logs: string): string {
  let last = ''
  for (const match of logs.matchAll(QBIT_TEMP_PASSWORD)) last = match[1] ?? ''
  return last
}

// Compose >= 5 prints "<id> <stage> <size>" (no colon); older versions and
// docker pull use "<id>: <stage>". Both map to the same stage label.
const LAYER_STAGE =
  /^[0-9a-f]{6,64}:? (Pulling fs layer|Waiting|Downloading|Download complete|Verifying Checksum|Extracting|Pull complete|Mounted from cache)\b/

const STAGE_LABELS: Record<string, string> = {
  'Pulling fs layer': 'pulling',
  Waiting: 'waiting',
  'Download complete': 'downloaded',
  Downloading: 'downloading',
  'Verifying Checksum': 'verifying',
  Extracting: 'extracting',
  'Pull complete': 'ready',
  'Mounted from cache': 'cached'
}

// Maps a raw docker compose pull line to a stage label for the spinner, or
// null when the line carries no progress info (image status lines, noise).
export function parseComposeProgress(line: string): string | null {
  const stage = LAYER_STAGE.exec(line.trim())?.[1]
  return stage ? STAGE_LABELS[stage] ?? stage.toLowerCase() : null
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

function portWaitPhase(label: string, port: number, timeoutMs: number): WaitPhase {
  return {
    label: `Waiting for ${label}...`,
    run: (update) =>
      waitForPort('localhost', port, timeoutMs, {
        onTick: (attempt, maxAttempts) => update(`Waiting for ${label}... (${attempt}/${maxAttempts})`)
      }).then(() => undefined)
  }
}

export async function startServices(ctx: StepContext): Promise<void> {
  stepHeader(9, 'Starting selected services')
  const files = ctx.composeFiles
  const { selection } = ctx

  const config = await compose(files, 'config', '-q')
  if (config.code !== 0) {
    throw new SetupFailure('The selected compose files do not merge correctly.', [`Files: ${files.join(' ')}`])
  }

  if (ctx.stateFound) await removeDeselectedServices(ctx)

  const services = infraServicesFor(selection)

  // Pull one service at a time: the plain (non-TTY) pull stream does not reliably
  // tie layer lines to an image, so the spinner gets its name from the loop and
  // only the stage is parsed out of the output. Lode goes first - it is the
  // critical image, so its pull failure surfaces early.
  const pullServices = ['lode', ...services]
  for (const service of pullServices) {
    const name = serviceDisplayName(service)
    const pull = spinner()
    pull.start(`Pulling ${name}...`)
    let lastStage = ''
    const result = await composeOnLine(files, ['pull', service], (line) => {
      const stage = parseComposeProgress(line)
      if (stage && stage !== lastStage) {
        lastStage = stage
        pull.message(`${name}: ${stage}`)
      }
    })
    if (result.code !== 0) {
      pull.clear()
      throw new SetupFailure(`Failed to pull ${name}. Check your network and try again.`, [
        `You can also try manually: ${dcCmdPrefix(files)} pull ${service}`
      ])
    }
    pull.stop(`${name} ready`)
  }
  if (!(await imageExists(selection.imageTag))) {
    throw new SetupFailure(
      `Failed to pull the Lode image (${LODE_IMAGE}:${selection.imageTag}). Check your network and try again.`,
      [`You can also try manually: ${dcCmdPrefix(files)} pull lode`]
    )
  }

  const up = spinner()
  up.start('Starting selected services...')
  await compose(files, 'up', '-d', ...services)
  // Clear instead of stop: the readiness wait below prints the single success
  // line, and clack log output would be wiped while a spinner is still active.
  up.clear()

  const failed: string[] = []
  for (const service of services) {
    if (await serviceRunning(files, service)) continue
    failed.push(service)
    log.warn(`${service} failed to start: ${await serviceLastLogLine(files, service)}`)
  }

  if (failed.includes('redis')) {
    throw new SetupFailure('Redis failed to start. Cannot continue.', [`Check logs: ${dcCmdPrefix(files)} logs redis`])
  }
  if (selection.dbDriver === 'postgres' && failed.includes('postgres')) {
    throw new SetupFailure('PostgreSQL failed to start. Cannot continue.', [
      `Check logs: ${dcCmdPrefix(files)} logs postgres`
    ])
  }
  if (selection.qbittorrent === 'local' && failed.includes('qbittorrent')) {
    throw new SetupFailure('qBittorrent failed to start. Cannot continue.', [
      `Check logs: ${dcCmdPrefix(files)} logs qbittorrent`
    ])
  }

  // Non-fatal services: warn once now and skip their wait phase.
  if (selection.prowlarr === 'local' && failed.includes('prowlarr')) {
    log.warn('Prowlarr not running - you can configure it later (step 12)')
  }
  if (selection.mediaMode === 'local' && failed.includes('jellyfin')) {
    log.warn('Jellyfin not running - you can configure it later (step 10)')
  }

  // One spinner carries the whole readiness wait and stops on the single
  // success line, so the started/running status is never printed twice.
  const phases: WaitPhase[] = [portWaitPhase('Redis', PORTS.redis, PORT_TIMEOUTS.redis)]
  if (selection.qbittorrent === 'local') {
    phases.push(portWaitPhase('qBittorrent', PORTS.qbittorrent, PORT_TIMEOUTS.qbittorrent))
    phases.push({
      // The temp password only lands in the logs once qBittorrent has been up briefly.
      label: 'Collecting qBittorrent password...',
      run: () =>
        sleep(3000).then(async () => {
          ctx.qbitTempPass = extractQbitTempPassword(await logsTail(files, 'qbittorrent', 100_000))
        })
    })
  }
  if (selection.prowlarr === 'local' && !failed.includes('prowlarr')) {
    phases.push(portWaitPhase('Prowlarr', PORTS.prowlarr, PORT_TIMEOUTS.prowlarr))
  }
  if (selection.mediaMode === 'local' && !failed.includes('jellyfin')) {
    phases.push(portWaitPhase('Jellyfin', PORTS.jellyfin, PORT_TIMEOUTS.jellyfin))
  }
  if (selection.dbDriver === 'postgres') {
    phases.push(portWaitPhase('PostgreSQL', PORTS.postgres, PORT_TIMEOUTS.postgres))
  }
  phases.push({ label: 'Settling services...', run: () => sleep(10_000) })

  const waitSpinner = spinner()
  let first = true
  for (const phase of phases) {
    if (first) {
      waitSpinner.start(phase.label)
      first = false
    } else {
      waitSpinner.message(phase.label)
    }
    await phase.run((msg) => waitSpinner.message(msg))
  }
  waitSpinner.stop('Selected services are up and running')
}
