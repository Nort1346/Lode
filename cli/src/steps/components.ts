import { composeFilesFor, ENV_FILE, ENV_KEYS, INTERNAL_URLS, OPTION_LABELS } from '../constants'
import { readEnvValue } from '../core/env'
import { askMultiSelect, askSelect, askText, log, stepHeader } from '../core/prompt'
import type { MediaChoice, ServiceMode, StepContext } from '../types'

export function isValidHttpUrl(value: string): boolean {
  return /^https?:\/\//.test(value)
}

// The current .env value, unless it is the internal in-network URL (not useful as
// a default for an externally hosted service).
export function externalUrlDefault(dir: string, key: string, internalUrl: string): string {
  const value = readEnvValue(dir, ENV_FILE, key)
  return value !== '' && value !== internalUrl ? value : ''
}

// Prefill the media menu from the persisted selection.
function currentMediaChoice(ctx: StepContext): MediaChoice {
  const { mediaProvider, mediaMode } = ctx.selection
  if (mediaMode === 'local' || mediaMode === 'external') {
    return mediaProvider === 'plex' ? `plex-${mediaMode}` : `jellyfin-${mediaMode}`
  }
  return 'none'
}

export async function chooseComponents(ctx: StepContext): Promise<void> {
  stepHeader(7, 'Selecting components')
  log.message('Lode and Redis are always deployed. Choose the rest:')
  const dir = process.cwd()

  const qbit = await askSelect<ServiceMode>(
    'How should Lode download torrents?',
    [
      { value: 'local', label: OPTION_LABELS.qbitLocal },
      { value: 'external', label: OPTION_LABELS.qbitExternal }
    ],
    ctx.selection.qbittorrent
  )
  ctx.selection.qbittorrent = qbit
  if (qbit === 'external') {
    const url = await askText(
      'External qBittorrent URL (http://host:8080)',
      externalUrlDefault(dir, ENV_KEYS.qbittorrentUrl, INTERNAL_URLS.qbittorrent)
    )
    if (!isValidHttpUrl(url))
      log.warn('External qBittorrent URL does not start with http(s):// - Lode will not be able to reach it')
    ctx.urls.qbittorrent = url
  } else {
    ctx.urls.qbittorrent = ''
  }
  log.success(`qBittorrent: ${qbit}`)

  const prowlarr = await askSelect<ServiceMode>(
    'How should Lode index torrents?',
    [
      { value: 'local', label: OPTION_LABELS.prowlarrLocal },
      { value: 'external', label: OPTION_LABELS.prowlarrExternal }
    ],
    ctx.selection.prowlarr
  )
  ctx.selection.prowlarr = prowlarr
  if (prowlarr === 'external') {
    const url = await askText(
      'External Prowlarr URL (http://host:9696)',
      externalUrlDefault(dir, ENV_KEYS.prowlarrUrl, INTERNAL_URLS.prowlarr)
    )
    if (!isValidHttpUrl(url))
      log.warn('External Prowlarr URL does not start with http(s):// - Lode will not be able to reach it')
    ctx.urls.prowlarr = url
  } else {
    ctx.urls.prowlarr = ''
  }
  log.success(`Prowlarr: ${prowlarr}`)

  const mediaChoice = await askSelect<MediaChoice>(
    'Media server (library detection)?',
    [
      { value: 'jellyfin-local', label: OPTION_LABELS.jellyfinLocal },
      { value: 'jellyfin-external', label: OPTION_LABELS.jellyfinExternal },
      { value: 'plex-local', label: OPTION_LABELS.plexLocal },
      { value: 'plex-external', label: OPTION_LABELS.plexExternal },
      { value: 'none', label: OPTION_LABELS.mediaNone }
    ],
    currentMediaChoice(ctx)
  )
  ctx.selection.mediaProvider = mediaChoice === 'none' ? 'none' : mediaChoice.startsWith('plex') ? 'plex' : 'jellyfin'
  ctx.selection.mediaMode = mediaChoice === 'none' ? 'none' : mediaChoice.endsWith('external') ? 'external' : 'local'
  if (ctx.selection.mediaMode === 'external') {
    const isPlex = ctx.selection.mediaProvider === 'plex'
    const url = await askText(
      isPlex ? 'External Plex URL (http://host:32400)' : 'External Jellyfin URL (http://host:8096)',
      externalUrlDefault(
        dir,
        isPlex ? ENV_KEYS.plexUrl : ENV_KEYS.jellyfinUrl,
        isPlex ? INTERNAL_URLS.plex : INTERNAL_URLS.jellyfin
      )
    )
    if (!isValidHttpUrl(url))
      log.warn(`${isPlex ? 'Plex' : 'Jellyfin'} URL does not start with http(s):// - Lode will not be able to reach it`)
    ctx.urls.jellyfin = isPlex ? '' : url
    ctx.urls.plex = isPlex ? url : ''
  } else {
    ctx.urls.jellyfin = ''
    ctx.urls.plex = ''
  }
  log.success(`Media server: ${ctx.selection.mediaProvider} (${ctx.selection.mediaMode})`)

  const addonInitial: string[] = []
  if (ctx.selection.flaresolverr) addonInitial.push('flaresolverr')
  if (ctx.selection.dozzle) addonInitial.push('dozzle')
  const addons = await askMultiSelect(
    'Select optional add-ons:',
    [
      { value: 'flaresolverr', label: OPTION_LABELS.flaresolverr },
      { value: 'dozzle', label: OPTION_LABELS.dozzle }
    ],
    addonInitial,
    false // add-ons are optional: selecting none is a valid answer
  )
  ctx.selection.flaresolverr = addons.includes('flaresolverr')
  ctx.selection.dozzle = addons.includes('dozzle')
  log.success(`Add-ons: FlareSolverr=${ctx.selection.flaresolverr} Dozzle=${ctx.selection.dozzle}`)

  ctx.composeFiles = composeFilesFor(ctx.selection)
}
