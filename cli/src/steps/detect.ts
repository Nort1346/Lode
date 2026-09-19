import { ENV_FILE, ENV_KEYS, STATE_FILE } from '../constants'
import { readEnvValue } from '../core/env'
import { askConfirm, log, stepHeader } from '../core/prompt'
import { loadSelection } from '../core/state'
import type { StepContext } from '../types'

export async function detectExistingSetup(ctx: StepContext): Promise<void> {
  stepHeader(3, 'Detecting existing setup')
  const existing = loadSelection(process.cwd())
  if (!existing) return
  ctx.stateFound = true
  ctx.previousSelection = existing
  ctx.selection = existing
  ctx.urls = {
    qbittorrent: readEnvValue(process.cwd(), ENV_FILE, ENV_KEYS.qbittorrentUrl),
    prowlarr: readEnvValue(process.cwd(), ENV_FILE, ENV_KEYS.prowlarrUrl),
    jellyfin: readEnvValue(process.cwd(), ENV_FILE, ENV_KEYS.jellyfinUrl)
  }
  log.info(`Existing setup found (${STATE_FILE}):`)
  log.message([
    `  Database:    ${existing.dbDriver}`,
    `  qBittorrent: ${existing.qbittorrent}`,
    `  Prowlarr:    ${existing.prowlarr}`,
    `  Media:       ${existing.mediaProvider} (${existing.mediaMode})`,
    `  Add-ons:     FlareSolverr=${existing.flaresolverr} Dozzle=${existing.dozzle}`
  ])
  if (!(await askConfirm('Reconfigure your existing Lode setup?', true))) {
    log.success('Keeping existing setup - no changes made.')
    process.exit(0)
  }
}
