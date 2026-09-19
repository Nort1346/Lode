import { showTitleBanner } from './core/banner'
import { SetupFailure } from './core/errors'
import { isTty, pauseBeforeExit } from './core/platform'
import { log, outro } from './core/prompt'
import { DEFAULT_SELECTION } from './core/state'
import { showBanner } from './steps/banner'
import { checkPrerequisites } from './steps/prerequisites'
import { setupEnvFile } from './steps/env-file'
import { detectExistingSetup } from './steps/detect'
import { generateSecrets } from './steps/secrets-gen'
import { chooseDatabase } from './steps/database'
import { chooseComponents } from './steps/components'
import { downloadComposeFiles } from './steps/compose-files'
import { chooseLodeVersion } from './steps/lode-version'
import { startServices } from './steps/services'
import { jellyfinApiKey } from './steps/jellyfin'
import { qbittorrentSetup } from './steps/qbittorrent'
import { prowlarrApiKey } from './steps/prowlarr'
import { tmdbApiKey } from './steps/tmdb'
import { discordWebhook } from './steps/discord'
import { startLode } from './steps/start-lode'
import { showSummary } from './steps/summary'
import type { StepContext } from './types'

async function main(): Promise<void> {
  if (!isTty()) {
    console.error('Interactive terminal required, but none is available.')
    console.error('Run it from a terminal - `curl | bash` and `irm | iex` are handled by the setup scripts.')
    process.exit(1)
  }
  await showTitleBanner()
  const ctx: StepContext = {
    stateFound: false,
    previousSelection: null,
    selection: { ...DEFAULT_SELECTION },
    urls: { qbittorrent: '', prowlarr: '', jellyfin: '' },
    composeFiles: ['docker-compose.yml'],
    qbitTempPass: '',
    adminPass: ''
  }
  await showBanner()
  await checkPrerequisites()
  await setupEnvFile()
  await detectExistingSetup(ctx)
  generateSecrets()
  await chooseDatabase(ctx)
  await chooseComponents(ctx)
  await downloadComposeFiles(ctx)
  await chooseLodeVersion(ctx)
  await startServices(ctx)
  await jellyfinApiKey(ctx)
  await qbittorrentSetup(ctx)
  await prowlarrApiKey(ctx)
  await tmdbApiKey()
  await discordWebhook()
  await startLode(ctx)
  showSummary(ctx)
  outro('Setup complete - enjoy!')
  await showTitleBanner()
  await pauseBeforeExit()
}

main().catch((error: unknown) => {
  if (error instanceof SetupFailure) {
    log.error(error.message)
    for (const line of error.detailLines) console.log(line)
    process.exit(1)
  }
  log.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
