import { ENV_FILE, ENV_KEYS } from '../constants'
import { updateEnv } from '../core/env'
import { hyperlink } from '../core/hyperlink'
import { askSecret, instructions, log, stepHeader } from '../core/prompt'
import type { StepContext } from '../types'

export async function prowlarrApiKey(ctx: StepContext): Promise<void> {
  stepHeader(12, 'Prowlarr API key')
  const dir = process.cwd()
  if (ctx.selection.prowlarr === 'local') {
    instructions('Follow these steps to get your Prowlarr API key', [
      `1. Open ${hyperlink('http://localhost:9900')} in your browser`,
      '2. Go to Settings > General',
      '3. Find the API Key field',
      '4. Copy the API key'
    ])
    log.warn('IMPORTANT: Prowlarr needs indexers before Lode can find anything.')
    log.message(['  Add at least one indexer (e.g. YTS): Settings > Indexers > Add'])
    if (ctx.selection.flaresolverr) {
      log.message([
        '  For private trackers: Settings > Indexers > Add > FlareSolverr',
        '  Set URL: http://flaresolverr:8191'
      ])
    }
  } else {
    log.message(`Your external Prowlarr instance: ${hyperlink(ctx.urls.prowlarr)}`)
    log.message('Find the API key in Prowlarr: Settings > General')
  }
  const key = await askSecret('Prowlarr API key')
  if (key) {
    updateEnv(dir, ENV_FILE, ENV_KEYS.prowlarrApiKey, key)
    log.success('Prowlarr API key saved')
  } else {
    log.warn('Skipping Prowlarr API key -- set it later in .env')
  }
}
