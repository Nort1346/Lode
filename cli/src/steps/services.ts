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
import { infraServicesFor, LODE_IMAGE, PORTS, PORT_TIMEOUTS } from '../constants'
import type { ComposeProgress, DeselectionCheck, StepContext, WaitPhase } from '../types'

const QBIT_TEMP_PASSWORD = /A temporary password is provided for this session:\s*(\S+)/g

export function extractQbitTempPassword(logs: string): string {
  let last = ''
  for (const match of logs.matchAll(QBIT_TEMP_PASSWORD)) last = match[1] ?? ''
  return last
}

const LAYER_STAGE =
  /^([0-9a-f]{6,64}): (Pulling fs layer|Waiting|Downloading|Download complete|Verifying Checksum|Extracting|Pull complete|Mounted from cache)/
const IMAGE_STATUS = /^(\S+) (Pulling|Pulled)\b/
const IMAGE_PULLING = /^Pulling (\S+)/

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

// Maps a raw docker compose pull line to a clean { image, stage } for the spinner.
function parseComposeProgress(line: string): ComposeProgress | null {
  const trimmed = line.trim()
  if (!trimmed) return null
  const layer = LAYER_STAGE.exec(trimmed)
  const rawStage = layer?.[2]
  if (rawStage) return { stage: STAGE_LABELS[rawStage] ?? rawStage.toLowerCase() }
  const status = IMAGE_STATUS.exec(trimmed)
  if (status?.[1] && status[2]) {
    return { image: status[1], stage: status[2] === 'Pulled' ? 'pulled' : 'pulling' }
  }
  const pulling = IMAGE_PULLING.exec(trimmed)
  if (pulling?.[1]) return { image: pulling[1], stage: 'pulling' }
  return null
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

  // One spinner covers pull + up; docker's raw layer output is parsed into a clean
  // "image: stage" message instead of being dumped to the terminal.
  const pull = spinner()
  pull.start('Pulling images...')
  let image = ''
  await composeOnLine(files, ['pull'], (line) => {
    const progress = parseComposeProgress(line)
    if (!progress) return
    if (progress.image) image = progress.image
    if (progress.stage) pull.message(`${image ? `${image}: ` : ''}${progress.stage}`)
  })
  if (!(await imageExists(selection.imageTag))) {
    pull.clear()
    throw new SetupFailure(
      `Failed to pull the Lode image (${LODE_IMAGE}:${selection.imageTag}). Check your network and try again.`,
      [`You can also try manually: ${dcCmdPrefix(files)} pull lode`]
    )
  }
  pull.message('Starting selected services...')
  await compose(files, 'up', '-d', ...services)
  pull.stop('Services started')

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

  // One spinner carries the whole readiness wait; its message moves with each phase.
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
  waitSpinner.stop('Selected services are running')
}
