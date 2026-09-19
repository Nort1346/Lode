import { composeFilesFor, ENV_FILE, ENV_KEYS, INTERNAL_URLS, OPTION_LABELS } from '../constants'
import { readEnvValue } from '../core/env'
import { askMultiSelect, askSelect, askText, log, stepHeader } from '../core/prompt'
import type { MediaMode, ServiceMode, StepContext } from '../types'

export function isValidHttpUrl(value: string): boolean {
  return /^https?:\/\//.test(value)
}

// The current .env value, unless it is the internal in-network URL (not useful as
// a default for an externally hosted service).
export function externalUrlDefault(dir: string, key: string, internalUrl: string): string {
  const value = readEnvValue(dir, ENV_FILE, key)
  return value !== '' && value !== internalUrl ? value : ''
}

export async function chooseComponents(ctx: StepContext): Promise<void> {
  stepHeader(6, 'Selecting components')
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

  const media = await askSelect<MediaMode>(
    'Media server (library detection)?',
    [
      { value: 'local', label: OPTION_LABELS.jellyfinLocal },
      { value: 'external', label: OPTION_LABELS.jellyfinExternal },
      { value: 'none', label: OPTION_LABELS.mediaNone }
    ],
    ctx.selection.mediaMode
  )
  ctx.selection.mediaMode = media
  ctx.selection.mediaProvider = media === 'none' ? 'none' : 'jellyfin'
  if (media === 'external') {
    const url = await askText(
      'External Jellyfin URL (http://host:8096)',
      externalUrlDefault(dir, ENV_KEYS.jellyfinUrl, INTERNAL_URLS.jellyfin)
    )
    if (!isValidHttpUrl(url))
      log.warn('External Jellyfin URL does not start with http(s):// - Lode will not be able to reach it')
    ctx.urls.jellyfin = url
  } else {
    ctx.urls.jellyfin = ''
  }
  log.success(`Media server: ${ctx.selection.mediaProvider} (${media})`)

  const addonInitial: string[] = []
  if (ctx.selection.flaresolverr) addonInitial.push('flaresolverr')
  if (ctx.selection.dozzle) addonInitial.push('dozzle')
  const addons = await askMultiSelect(
    'Select optional add-ons:',
    [
      { value: 'flaresolverr', label: OPTION_LABELS.flaresolverr },
      { value: 'dozzle', label: OPTION_LABELS.dozzle }
    ],
    addonInitial
  )
  ctx.selection.flaresolverr = addons.includes('flaresolverr')
  ctx.selection.dozzle = addons.includes('dozzle')
  log.success(`Add-ons: FlareSolverr=${ctx.selection.flaresolverr} Dozzle=${ctx.selection.dozzle}`)

  ctx.composeFiles = composeFilesFor(ctx.selection)
}
