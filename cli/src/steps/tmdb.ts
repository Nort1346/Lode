import { DOCS_LINKS, ENV_FILE, ENV_KEYS } from '../constants'
import { updateEnv } from '../core/env'
import { hyperlink } from '../core/hyperlink'
import { askSelect, askSecret, instructions, log, stepHeader } from '../core/prompt'

export async function tmdbApiKey(): Promise<void> {
  stepHeader(13, 'TMDB API key')
  const choice = await askSelect<'builtin' | 'own'>(
    'TMDB API key (for movie/TV metadata)',
    [
      {
        value: 'builtin',
        label: 'Use the built-in shared key (recommended)',
        hint: 'Works immediately, no account needed'
      },
      { value: 'own', label: 'Use my own TMDB API key', hint: 'Higher rate limits, your own account' }
    ],
    'builtin'
  )
  if (choice === 'builtin') {
    log.success('Using the built-in shared TMDB key - nothing to configure')
    return
  }
  instructions('Follow these steps to get your TMDB API key', [
    `1. Go to ${hyperlink(DOCS_LINKS.tmdbApi)}`,
    '2. Create a free account (or log in)',
    '3. Click the link to generate an API key',
    '4. Fill in the form:  Application Name: Lode  /  Application URL: http://localhost:5757',
    '5. Copy your API Key (v3 auth)'
  ])
  const key = await askSecret('TMDB API key')
  if (key) {
    updateEnv(process.cwd(), ENV_FILE, ENV_KEYS.tmdbApiKey, key)
    log.success('TMDB API key saved')
  } else {
    log.warn(
      'Skipping your own key - Lode will use the built-in shared key (you can still set NUXT_TMDB_API_KEY in .env later)'
    )
  }
}
