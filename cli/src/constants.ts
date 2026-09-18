import type { ComposeFileName, SetupSelection } from './types'

export const REPO_OWNER = 'Nort1346'
export const REPO_NAME = 'Lode'
export const REPO_RAW = `https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/main`
export const RELEASE_API_URL = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/releases/latest`

export const LODE_IMAGE = 'ghcr.io/nort1346/lode'

export const ENV_FILE = '.env'
export const ENV_EXAMPLE_FILE = '.env.example'
export const COMPOSE_BASE = 'docker-compose.yml'
/** Flat key=value selection memory for re-runs. */
export const STATE_FILE = '.lode-setup'
export const STATE_VERSION = 1

export const MEDIA_DIRS = ['media/Movies', 'media/Series'] as const

export const ENV_KEYS = {
  sessionPassword: 'NUXT_SESSION_PASSWORD',
  trackerEncryptionKey: 'NUXT_TRACKER_ENCRYPTION_KEY',
  postgresPassword: 'POSTGRES_PASSWORD',
  dbDriver: 'DB_DRIVER',
  redisUrl: 'NUXT_REDIS_URL',
  databaseUrl: 'DATABASE_URL',
  qbittorrentUrl: 'NUXT_QBITTORRENT_URL',
  qbittorrentApiKey: 'NUXT_QBITTORRENT_API_KEY',
  prowlarrUrl: 'NUXT_PROWLARR_URL',
  prowlarrApiKey: 'NUXT_PROWLARR_API_KEY',
  jellyfinUrl: 'NUXT_JELLYFIN_URL',
  jellyfinApiKey: 'NUXT_JELLYFIN_API_KEY',
  flaresolverrUrl: 'NUXT_FLARESOLVERR_URL',
  tmdbApiKey: 'NUXT_TMDB_API_KEY',
  discordWebhookUrl: 'NUXT_DISCORD_WEBHOOK_URL'
} as const

export const INTERNAL_URLS = {
  qbittorrent: 'http://qbittorrent:8080',
  prowlarr: 'http://prowlarr:9696',
  jellyfin: 'http://jellyfin:8096',
  flaresolverr: 'http://flaresolverr:8191',
  redis: 'redis://redis:6379'
} as const

export const PORTS = {
  lode: 5757,
  qbittorrent: 8080,
  jellyfin: 8096,
  prowlarr: 9900,
  flaresolverr: 8191,
  dozzle: 8082,
  redis: 6379,
  postgres: 5432
} as const

export const PORT_TIMEOUTS = {
  redis: 30_000,
  qbittorrent: 60_000,
  prowlarr: 60_000,
  jellyfin: 90_000,
  postgres: 30_000,
  lode: 120_000
} as const

export const SECRET_MIN_LENGTH = 32

export const PASSWORD_LENGTH = 32

export const TRACKER_KEY_BYTES = 32

export const TOTAL_STEPS = 15

export const DOCS_LINKS = {
  dockerMac: 'https://docs.docker.com/desktop/install/mac-install/',
  dockerWindows: 'https://docs.docker.com/desktop/wsl/',
  dockerLinux: 'https://docs.docker.com/engine/install/',
  dockerGeneric: 'https://docs.docker.com/get-docker/',
  composeLinux: 'https://docs.docker.com/compose/install/linux/',
  tmdbApi: 'https://www.themoviedb.org/settings/api'
} as const

export const OPTION_LABELS = {
  qbitLocal: 'Local qBittorrent container (recommended)',
  qbitExternal: 'External qBittorrent (you host it)',
  prowlarrLocal: 'Local Prowlarr container (recommended)',
  prowlarrExternal: 'External Prowlarr (you host it)',
  jellyfinLocal: 'Jellyfin (local container)',
  jellyfinExternal: 'Jellyfin (external)',
  mediaNone: 'No media server',
  flaresolverr: 'FlareSolverr - CAPTCHA bypass for private trackers',
  dozzle: 'Dozzle - Docker log viewer'
} as const

export function composeFilesFor(selection: SetupSelection): ComposeFileName[] {
  const files: ComposeFileName[] = ['docker-compose.yml']
  if (selection.dbDriver === 'postgres') files.push('docker-compose.postgres.yml')
  if (selection.qbittorrent === 'local') files.push('docker-compose.qbittorrent.yml')
  if (selection.prowlarr === 'local') files.push('docker-compose.prowlarr.yml')
  if (selection.mediaMode === 'local') files.push('docker-compose.jellyfin.yml')
  if (selection.flaresolverr) files.push('docker-compose.flaresolverr.yml')
  if (selection.dozzle) files.push('docker-compose.dozzle.yml')
  return files
}

export function infraServicesFor(selection: SetupSelection): string[] {
  const services = ['redis']
  if (selection.dbDriver === 'postgres') services.push('postgres')
  if (selection.qbittorrent === 'local') services.push('qbittorrent')
  if (selection.prowlarr === 'local') services.push('prowlarr')
  if (selection.mediaMode === 'local') services.push('jellyfin')
  if (selection.flaresolverr) services.push('flaresolverr')
  if (selection.dozzle) services.push('dozzle')
  return services
}
