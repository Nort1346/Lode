import { DOCS_LINKS, ENV_FILE, ENV_KEYS } from '../constants'
import { updateEnv } from '../core/env'
import { hyperlink } from '../core/hyperlink'
import { askSecret, instructions, log, stepHeader } from '../core/prompt'

export async function tmdbApiKey(): Promise<void> {
  stepHeader(13, 'TMDB API key')
  instructions('Follow these steps to get your TMDB API key', [
    `1. Go to ${hyperlink(DOCS_LINKS.tmdbApi)}`,
    '2. Create a free account (or log in)',
    '3. Click the link to generate an API key',
    '4. Fill in the form:  Application Name: Lode  /  Application URL: http://localhost:5757',
    '5. Copy your API Key (v3 auth)'
  ])
  log.info('This is required for movie/TV metadata.')
  const key = await askSecret('TMDB API key')
  if (key) {
    updateEnv(process.cwd(), ENV_FILE, ENV_KEYS.tmdbApiKey, key)
    log.success('TMDB API key saved')
  } else {
    log.warn('Skipping TMDB API key -- set it later in .env')
  }
}
