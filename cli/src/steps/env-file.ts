import { copyFileSync, existsSync, mkdirSync, renameSync } from 'node:fs'
import { ENV_EXAMPLE_FILE, ENV_FILE, MEDIA_DIRS, REPO_RAW } from '../constants'
import { downloadFile } from '../core/download'
import { SetupFailure } from '../core/errors'
import { log, spinner, stepHeader } from '../core/prompt'

export async function setupEnvFile(): Promise<void> {
  stepHeader(2, 'Setting up .env file')
  if (existsSync(ENV_FILE)) {
    log.warn('.env exists - keeping existing config')
  } else {
    if (!existsSync(ENV_EXAMPLE_FILE)) {
      const dl = spinner()
      dl.start('Downloading .env.example...')
      try {
        await downloadFile(`${REPO_RAW}/${ENV_EXAMPLE_FILE}`, ENV_EXAMPLE_FILE)
      } catch {
        dl.clear()
        throw new SetupFailure('Failed to download .env.example from GitHub.', [
          '  Check your internet connection and try again.'
        ])
      }
      dl.stop('.env.example downloaded')
    }
    copyFileSync(ENV_EXAMPLE_FILE, `${ENV_FILE}.tmp`)
    renameSync(`${ENV_FILE}.tmp`, ENV_FILE)
    log.success('Created .env from .env.example')
  }
  for (const dir of MEDIA_DIRS) mkdirSync(dir, { recursive: true })
  log.success('Created media directories (media/Movies, media/Series)')
}
