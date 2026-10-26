import { ENV_FILE, ENV_KEYS } from '../constants'
import { updateEnv } from '../core/env'
import { hyperlink } from '../core/hyperlink'
import { askSecret, instructions, log, stepHeader } from '../core/prompt'
import type { StepContext } from '../types'

export async function plexToken(ctx: StepContext): Promise<void> {
  stepHeader(12, 'Plex token')
  const dir = process.cwd()
  if (ctx.selection.mediaProvider !== 'plex') {
    updateEnv(dir, ENV_FILE, ENV_KEYS.plexUrl, '')
    updateEnv(dir, ENV_FILE, ENV_KEYS.plexToken, '')
    if (ctx.selection.mediaProvider === 'none') {
      log.info('No media server selected - NUXT_PLEX_URL and NUXT_PLEX_TOKEN cleared')
    }
    return
  }
  if (ctx.selection.mediaMode === 'local') {
    instructions('Follow these steps to get your Plex token', [
      `1. Open ${hyperlink('http://localhost:32400/web')} in your browser and sign in`,
      '2. Press F12 to open developer tools and switch to the Network tab',
      '3. Click a library or play an item',
      '4. Pick any request and copy the X-Plex-Token header value'
    ])
  } else {
    log.message(`Your external Plex instance: ${hyperlink(ctx.urls.plex)}`)
    log.message('Find your token in your Plex account settings, or as the X-Plex-Token header in devtools (Network tab)')
  }
  const token = await askSecret('Plex token')
  if (token) {
    updateEnv(dir, ENV_FILE, ENV_KEYS.plexToken, token)
    log.success('Plex token saved')
  } else {
    log.warn('Skipping Plex token - set it later in .env')
  }
}
