import { ENV_FILE, ENV_KEYS } from '../constants'
import { updateEnv } from '../core/env'
import { hyperlink } from '../core/hyperlink'
import { askSecret, instructions, log, stepHeader } from '../core/prompt'
import type { StepContext } from '../types'

export async function jellyfinApiKey(ctx: StepContext): Promise<void> {
  stepHeader(10, 'Jellyfin API key')
  const dir = process.cwd()
  if (ctx.selection.mediaProvider === 'none') {
    updateEnv(dir, ENV_FILE, ENV_KEYS.jellyfinUrl, '')
    updateEnv(dir, ENV_FILE, ENV_KEYS.jellyfinApiKey, '')
    log.info('No media server selected - NUXT_JELLYFIN_URL and NUXT_JELLYFIN_API_KEY cleared')
    return
  }
  if (ctx.selection.mediaMode === 'local') {
    instructions('Follow these steps to get your Jellyfin API key', [
      `1. Open ${hyperlink('http://localhost:8096')} in your browser`,
      '2. Complete the setup wizard (create your admin account)',
      '3. Go to Dashboard (gear icon) > API Keys',
      '4. Click the + button, name it Lode, click OK',
      '5. Copy the generated API key'
    ])
  } else {
    log.message(`Your external Jellyfin instance: ${hyperlink(ctx.urls.jellyfin)}`)
    log.message('Create an API key in Jellyfin: Dashboard (gear icon) > API Keys')
  }
  const key = await askSecret('Jellyfin API key')
  if (key) {
    updateEnv(dir, ENV_FILE, ENV_KEYS.jellyfinApiKey, key)
    log.success('Jellyfin API key saved')
  } else {
    log.warn('Skipping Jellyfin API key -- set it later in .env')
  }
}
