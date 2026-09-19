import { ENV_FILE, ENV_KEYS } from '../constants'
import { updateEnv } from '../core/env'
import { askConfirm, askSecret, instructions, log, stepHeader } from '../core/prompt'

export async function discordWebhook(): Promise<void> {
  stepHeader(14, 'Discord Webhook (optional)')
  if (!(await askConfirm('Get notified in Discord when downloads complete. Set up a webhook now?'))) {
    log.info('Skipped - set NUXT_DISCORD_WEBHOOK_URL in .env later if you change your mind.')
    return
  }
  instructions('To set up a Discord webhook', [
    '1. Open your Discord server',
    '2. Go to Server Settings > Integrations > Webhooks',
    '3. Click New Webhook',
    '4. Name it, choose a channel, click Copy Webhook URL'
  ])
  const key = await askSecret('Discord Webhook URL')
  if (key) {
    updateEnv(process.cwd(), ENV_FILE, ENV_KEYS.discordWebhookUrl, key)
    log.success('Discord webhook URL saved')
  } else {
    log.warn('Skipping Discord webhook -- set it later in .env')
  }
}
