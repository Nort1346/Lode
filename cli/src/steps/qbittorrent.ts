import { ENV_FILE, ENV_KEYS } from '../constants'
import { copyToClipboardOsc52 } from '../core/clipboard'
import { updateEnv } from '../core/env'
import { dcCmdPrefix } from '../core/docker'
import { hyperlink } from '../core/hyperlink'
import { askSecret, instructions, log, stepHeader } from '../core/prompt'
import type { StepContext } from '../types'

export async function qbittorrentSetup(ctx: StepContext): Promise<void> {
  stepHeader(11, 'qBittorrent WebUI + API key')
  const dir = process.cwd()
  if (ctx.selection.qbittorrent === 'local') {
    if (ctx.qbitTempPass) {
      copyToClipboardOsc52(ctx.qbitTempPass)
      log.message(`qBittorrent temporary password: ${ctx.qbitTempPass}`)
      log.message('Copied to clipboard (this replaces your previous clipboard contents)')
    } else {
      log.warn(`Could not extract qBittorrent temp password - check: ${dcCmdPrefix(ctx.composeFiles)} logs qbittorrent`)
    }
    instructions('Follow these steps to configure qBittorrent', [
      `1. Open ${hyperlink('http://localhost:8080')} in your browser`,
      '2. Login with:  Username: admin  /  Password: [temporary password shown above]',
      '3. Go to Tools > Options > Web UI',
      '4. Change the password to something you remember',
      '5. Save changes',
      '6. Go to Tools > Options > Web UI > API Key section',
      '7. Copy the API Key'
    ])
  } else {
    log.message(`Your external qBittorrent instance: ${hyperlink(ctx.urls.qbittorrent)}`)
    log.message('Find the API key in qBittorrent: Tools > Options > Web UI')
  }
  const key = await askSecret('qBittorrent API key')
  if (key) {
    updateEnv(dir, ENV_FILE, ENV_KEYS.qbittorrentApiKey, key)
    log.success('qBittorrent API key saved')
  } else {
    log.warn('Skipping qBittorrent API key -- set it later in .env')
  }
}
