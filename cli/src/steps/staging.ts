import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { ENV_FILE, ENV_KEYS, MEDIA_CONTAINER_PREFIX, STAGING_HOST_DIRS } from '../constants'
import { SetupFailure } from '../core/errors'
import { readEnvValue, removeEnv, updateEnv } from '../core/env'
import { askConfirm, log, stepHeader } from '../core/prompt'
import type { StepContext } from '../types'

// Maps a host dir under media/ to the path the containers see it at: both lode
// and qbittorrent mount ./media as /media, so staging only works inside media/.
// Returns null for anything else so a bad value fails loudly instead of
// silently pointing Lode at a dir it cannot reach.
export function stagingContainerPath(hostDir: string): string | null {
  const normalized = hostDir
    .replace(/\\/g, '/')
    .replace(/\/{2,}/g, '/')
    .replace(/\/+$/, '')
  const parts = normalized.split('/')
  if (parts[0] !== 'media' || parts.length < 2) return null
  if (parts.some((part) => part === '' || part === '.' || part === '..')) return null
  return `${MEDIA_CONTAINER_PREFIX}/${parts.slice(1).join('/')}`
}

// Sets the category's env var to the default container path and creates the
// host dir, but keeps a value the user already configured (custom or default).
function ensureCategory(dir: string, key: string, hostDir: string, existing: string): string {
  const containerPath = stagingContainerPath(hostDir)
  if (containerPath === null) {
    throw new SetupFailure(`Staging dir ${hostDir} is not under media/ - fix STAGING_HOST_DIRS.`, [])
  }
  if (existing === '' || existing === containerPath) {
    updateEnv(dir, ENV_FILE, key, containerPath)
    mkdirSync(path.join(dir, hostDir), { recursive: true })
  }
  return existing !== '' ? existing : containerPath
}

export async function configureStaging(ctx: StepContext): Promise<void> {
  stepHeader(8, 'Download staging (media organization)')
  const dir = process.cwd()
  const existingMovies = readEnvValue(dir, ENV_FILE, ENV_KEYS.downloadPathMovies)
  const existingSeries = readEnvValue(dir, ENV_FILE, ENV_KEYS.downloadPathSeries)
  const configured = existingMovies !== '' || existingSeries !== ''

  log.message('With staging, qBittorrent downloads into a staging folder and Lode imports finished')
  log.message('releases into your library (seeding-safe hardlinks). Media organization in')
  log.message('Lode > Admin > Settings can only be turned on when staging is configured.')

  const recommended = ctx.selection.qbittorrent === 'local'
  const enabled = await askConfirm(
    recommended ? 'Enable download staging? (recommended)' : 'Enable download staging?',
    configured || recommended
  )
  ctx.staging = enabled
  if (!enabled) {
    if (configured) {
      removeEnv(dir, ENV_FILE, ENV_KEYS.downloadPathMovies)
      removeEnv(dir, ENV_FILE, ENV_KEYS.downloadPathSeries)
      log.success('Removed staging paths from .env - downloads go straight into the library')
    } else {
      log.info(
        'Skipped - set NUXT_DOWNLOAD_PATH_MOVIES / NUXT_DOWNLOAD_PATH_SERIES in .env later to enable media organization'
      )
    }
    return
  }
  if (ctx.selection.qbittorrent === 'external') {
    log.warn(
      'External qBittorrent: the staging folders must sit on storage visible to both Lode and qBittorrent at the same path.'
    )
  }
  const movies = ensureCategory(dir, ENV_KEYS.downloadPathMovies, STAGING_HOST_DIRS.movies, existingMovies)
  const series = ensureCategory(dir, ENV_KEYS.downloadPathSeries, STAGING_HOST_DIRS.series, existingSeries)
  log.success(`Staging ready: movies=${movies} series=${series}`)
  log.message('Turn it on later in Lode: Admin > Settings > Media organization')
}
