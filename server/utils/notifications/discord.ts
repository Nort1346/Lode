import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { ContainerBuilder, TextDisplayBuilder } from '@discordjs/builders'
import type { SeparatorBuilder } from '@discordjs/builders'
import { bold, heading, HeadingLevel } from '@discordjs/formatters'
import { REST } from '@discordjs/rest'
import { Routes, MessageFlags } from 'discord-api-types/v10'
import type { APIContainerComponent, APITextDisplayComponent } from 'discord-api-types/v10'
import { settings } from '#server/database/schema'
import { eq } from 'drizzle-orm'
import { useDbAsync, dbGet } from '#server/utils/db'
import { getMovieDetails, getSeasonDetails, getTvShowDetails, getImageUrl } from '#server/utils/tmdb'
import { createLogger } from '#server/utils/logger'
import { createT, DISCORD_LOCALE_OPTIONS } from '#server/utils/i18n-server'
import type { DiscordLocale } from '#server/types/i18n'
import type { DownloadCompleteData, TmdbMeta, RequestPendingData } from '#server/types/discord'
import type { TorrentMeta } from '#server/types/torrent'
import { parseTorrentTitle, SOURCE_TAGS, CODEC_TAGS } from '#server/utils/torrents/torrent-ranker'
import type { EpisodeInfo } from '#server/types/release-episode'
import { parseEpisodeInfo } from '#server/utils/torrents/release-episode'
import { formatSize } from '#server/utils/format'

const log = createLogger('Discord')

const FALLBACK_POSTER_NAME = 'poster-not-found.png'
const FALLBACK_POSTER_PATH = resolve(process.cwd(), 'public', FALLBACK_POSTER_NAME)
const FALLBACK_POSTER_REF = `attachment://${FALLBACK_POSTER_NAME}`

// Discord safety caps. Classic embed limits (title 256, description 4096,
// total 6000) are the documented ceiling; Components V2 text blocks are kept
// well below them so the payload is never rejected.
export const DISCORD_TITLE_LIMIT = 200
export const DISCORD_TEXT_LIMIT = 2000
export const DISCORD_RELEASE_LIMIT = 500
export const DISCORD_TOTAL_LIMIT = 5500

// Event colors (Container accent): green = completed, blue = new request.
export const COMPLETED_ACCENT = 0x22c55e
export const REQUEST_ACCENT = 0x3b82f6

// Webhook transport: short timeout so a slow Discord never piles up work, and
// bounded 429 retries honoring retry_after. All failures are log-only - the
// download/sync flow must never break because of notifications.
const WEBHOOK_TIMEOUT_MS = 8000
const RATE_LIMIT_MAX_RETRIES = 2
const RATE_LIMIT_MAX_WAIT_MS = 10_000

export type TextTranslator = (key: string) => string

export function truncateText(value: string, max: number): string {
  const chars = [...value]
  if (chars.length <= max) return value
  return `${chars.slice(0, max - 3).join('')}...`
}

/**
 * Treats release names and titles as untrusted text: neutralizes markdown
 * formatting and, more importantly, @everyone/@here and role mentions so a
 * hostile torrent name can never ping a whole server.
 */
export function escapeDiscordText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/([*_~`|>#])/g, '\\$1')
    .replace(/@(everyone|here)/gi, (match) => `@\u200b${match.slice(1)}`)
    .replace(/<@&/g, '<@\u200b&')
}

function fillTemplate(template: string, vars: Record<string, string | number>): string {
  let out = template
  for (const [key, value] of Object.entries(vars)) {
    out = out.split(`{${key}}`).join(String(value))
  }
  return out
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

/** Human-readable episode suffix, e.g. `S02E05`, `Season 2 (full season)`. Null when nothing was detected. */
export function formatEpisodeSuffix(info: EpisodeInfo, t: TextTranslator): string | null {
  switch (info.kind) {
    case 'episode': {
      const season = info.seasons[0]
      const episode = info.episodes[0]
      if (season === undefined || episode === undefined) return null
      return `S${pad2(season)}E${pad2(episode)}`
    }
    case 'multi-episode': {
      const season = info.seasons[0]
      const first = info.episodes[0]
      const last = info.episodes[info.episodes.length - 1]
      if (season === undefined || first === undefined || last === undefined) return null
      return `S${pad2(season)}E${pad2(first)}-E${pad2(last)}`
    }
    case 'season-pack': {
      const season = info.seasons[0]
      if (season === undefined) return t('discord.fullSeason')
      return fillTemplate(t('discord.seasonFull'), { season })
    }
    case 'multiseason-pack': {
      const from = info.seasons[0]
      const to = info.seasons[info.seasons.length - 1]
      if (from === undefined || to === undefined) return null
      return fillTemplate(t('discord.seasonsPack'), { from, to })
    }
    case 'complete-series':
      return t('discord.completeSeries')
    case 'daily': {
      if (info.airDate === null) return null
      return fillTemplate(t('discord.airedOn'), { date: info.airDate })
    }
    case 'absolute': {
      const episode = info.episodes[0]
      if (episode === undefined) return null
      return fillTemplate(t('discord.episodeN'), { n: episode })
    }
    case 'unknown':
      return null
  }
}

/**
 * Display title: series/movie name plus the detected episode/pack suffix and
 * the TMDB episode title when known. A pack is never shown as a single item.
 */
export function buildDisplayTitle(
  baseTitle: string,
  info: EpisodeInfo,
  episodeName: string | null,
  t: TextTranslator
): string {
  const base = baseTitle.trim()
  const suffix = formatEpisodeSuffix(info, t)
  if (suffix === null) return escapeDiscordText(truncateText(base, DISCORD_TITLE_LIMIT))
  let title = `${base}, ${suffix}`
  if (episodeName !== null && episodeName.trim().length > 0 && (info.kind === 'episode' || info.kind === 'absolute')) {
    title += ` - ${episodeName.trim()}`
  }
  return escapeDiscordText(truncateText(title, DISCORD_TITLE_LIMIT))
}

export async function isDiscordMentionsEnabled(): Promise<boolean> {
  const db = await useDbAsync()
  const row = await dbGet(db.select().from(settings).where(eq(settings.key, 'discord_mentions_enabled')))
  return row?.value === 'true'
}

export async function getDiscordLocale(): Promise<DiscordLocale> {
  const db = await useDbAsync()
  const row = await dbGet(db.select().from(settings).where(eq(settings.key, 'discord_locale')))
  const val = row?.value
  if (val !== undefined && val !== null && DISCORD_LOCALE_OPTIONS.includes(val as DiscordLocale)) {
    return val as DiscordLocale
  }
  return 'en'
}

export async function fetchTmdbMeta(tmdbId: number, mediaType: string): Promise<TmdbMeta | null> {
  const locale = await getDiscordLocale()
  try {
    if (mediaType === 'movie') {
      const movie = await getMovieDetails(tmdbId, locale)
      return {
        title: movie.title,
        overview: movie.overview,
        posterUrl: getImageUrl(movie.poster_path, 'w500'),
        backdropUrl: getImageUrl(movie.backdrop_path, 'w1280'),
        runtime: movie.runtime,
        genres: movie.genres.map((g) => g.name),
        voteAverage: movie.vote_average,
        releaseDate: movie.release_date
      }
    }
    if (mediaType === 'tv') {
      const show = await getTvShowDetails(tmdbId, locale)
      return {
        title: show.name,
        overview: show.overview,
        posterUrl: getImageUrl(show.poster_path, 'w500'),
        backdropUrl: getImageUrl(show.backdrop_path, 'w1280'),
        runtime: null,
        genres: show.genres.map((g) => g.name),
        voteAverage: show.vote_average,
        releaseDate: show.first_air_date
      }
    }
  } catch {
    return null
  }
  return null
}

async function fetchEpisodeName(
  tmdbId: number,
  season: number,
  episode: number,
  locale: DiscordLocale
): Promise<string | null> {
  try {
    const details = await getSeasonDetails(tmdbId, season, locale)
    const found = details.episodes?.find((e) => e.episode_number === episode)
    const name = found?.name?.trim() ?? ''
    return name.length > 0 ? name : null
  } catch {
    return null
  }
}

function savePathLabel(savePath: string, t: TextTranslator): string {
  const map: Record<string, string> = {
    movies: t('discord.movies'),
    series: t('discord.series'),
    games: t('discord.games'),
    books: t('discord.books'),
    music: t('discord.music')
  }
  return map[savePath] ?? savePath
}

function addSeparator(container: ContainerBuilder): void {
  container.addSeparatorComponents((sep: SeparatorBuilder) => sep.setSpacing(2))
}

// Maps the shared release parser (torrent-ranker.ts) onto the Discord meta
// display strings - one implementation for all tag detection
function parseTorrentName(name: string): TorrentMeta {
  const parsed = parseTorrentTitle(name)
  const tags = parsed.tags

  let resolution: string | null = null
  if (parsed.resolution !== null) {
    if (parsed.resolution === '4k' || parsed.resolution === '2160p') resolution = '4K'
    else if (parsed.resolution === '8k') resolution = '8K'
    else resolution = parsed.resolution
  }

  const source = tags.find((tag) => SOURCE_TAGS.includes(tag)) ?? null
  const codec = tags.find((tag) => CODEC_TAGS.includes(tag)) ?? null

  let language: string | null = null
  if (parsed.language !== null) {
    const code = parsed.language.split('-')[0] ?? ''
    language = code === 'other' ? null : code.toUpperCase()
  }

  return { resolution, source, language, codec }
}

/** Extracts retry_after in ms from rate-limit errors (RateLimitError.retryAfter in seconds, or raw retry_after). */
function getRateLimitRetryMs(err: unknown): number | null {
  if (typeof err !== 'object' || err === null) return null
  const record = err as Record<string, unknown>
  const camel = record.retryAfter
  if (typeof camel === 'number' && Number.isFinite(camel) && camel >= 0) return camel * 1000
  const snake = record.retry_after
  if (typeof snake === 'number' && Number.isFinite(snake) && snake >= 0) return snake * 1000
  return null
}

function getHttpStatus(err: unknown): number | null {
  if (typeof err !== 'object' || err === null) return null
  const status = (err as Record<string, unknown>).status
  return typeof status === 'number' ? status : null
}

interface ComponentsPayload {
  components: (APIContainerComponent | APITextDisplayComponent)[]
  flags: number
  allowed_mentions: { parse: string[] } | { users: string[] }
}

interface OutgoingFile {
  data: Buffer
  name: string
  contentType: 'image/png'
}

async function postWebhook(webhookUrl: string, body: ComponentsPayload, files: OutgoingFile[]): Promise<void> {
  const match = webhookUrl.match(/\/webhooks\/(\d+)\/(.+?)(?:\/|$)/)
  const webhookId = match?.[1]
  const webhookToken = match?.[2]
  if (webhookId === undefined || webhookToken === undefined) {
    log.error({ url: webhookUrl }, 'webhook URL format invalid')
    return
  }

  // rejectOnRateLimit turns 429s into RateLimitError (with retryAfter) so we
  // can apply bounded retries instead of queueing unbounded inside the lib.
  const rest = new REST({ version: '10', timeout: WEBHOOK_TIMEOUT_MS, rejectOnRateLimit: () => true }).setToken(
    webhookToken
  )
  const route = Routes.webhook(webhookId, webhookToken)

  for (let attempt = 0; attempt <= RATE_LIMIT_MAX_RETRIES; attempt++) {
    try {
      await rest.post(route, {
        body,
        files,
        query: new URLSearchParams({ with_components: 'true' }),
        signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS)
      })
      return
    } catch (err: unknown) {
      const retryMs = getRateLimitRetryMs(err)
      if (retryMs !== null && attempt < RATE_LIMIT_MAX_RETRIES) {
        const waitMs = Math.min(retryMs, RATE_LIMIT_MAX_WAIT_MS)
        log.warn(`webhook rate limited, retrying in ${waitMs}ms (attempt ${attempt + 1})`)
        await new Promise<void>((resolve) => setTimeout(resolve, waitMs))
        continue
      }
      if (getHttpStatus(err) === 404) {
        log.warn('webhook returned 404 - it may have been deleted, not retrying')
        return
      }
      log.error(err instanceof Error ? err : new Error(String(err)), 'webhook post failed')
      return
    }
  }
}

export async function sendDownloadCompleteWebhook(data: DownloadCompleteData): Promise<void> {
  const config = useRuntimeConfig()
  const webhookUrl = config.discordWebhookUrl as string
  if (!webhookUrl) {
    log.warn('webhook URL not configured')
    return
  }

  const locale = await getDiscordLocale()
  const t = createT(locale)

  let tmdb: TmdbMeta | null = null
  if (data.tmdbId !== null && data.mediaType !== null) {
    tmdb = await fetchTmdbMeta(data.tmdbId, data.mediaType)
  }

  const baseTitle =
    (tmdb?.title ?? data.label ?? data.torrentName ?? t('discord.downloaded')).trim() || t('discord.downloaded')

  // The torrent name is the name of truth; the add-time label (which carries
  // the SxxExx chosen in the UI) is the fallback for rows with a bare name.
  let episode: EpisodeInfo = parseEpisodeInfo(data.torrentName)
  if (episode.kind === 'unknown' && data.label.length > 0) {
    episode = parseEpisodeInfo(data.label)
  }

  let episodeName: string | null = null
  const season = episode.seasons[0]
  const episodeNo = episode.episodes[0]
  if (
    data.tmdbId !== null &&
    data.mediaType === 'tv' &&
    (episode.kind === 'episode' || episode.kind === 'absolute') &&
    season !== undefined &&
    episodeNo !== undefined
  ) {
    episodeName = await fetchEpisodeName(data.tmdbId, season, episodeNo, locale)
  }

  const title = buildDisplayTitle(baseTitle, episode, episodeName, t)

  const container = new ContainerBuilder()
  container.setAccentColor(COMPLETED_ACCENT)

  container.addTextDisplayComponents((text: TextDisplayBuilder) =>
    text.setContent(escapeDiscordText(t('discord.completed')))
  )
  container.addTextDisplayComponents((text: TextDisplayBuilder) => text.setContent(heading(title, HeadingLevel.One)))

  let posterFile: Buffer | null = null
  if (tmdb !== null && tmdb.posterUrl !== null && tmdb.posterUrl !== undefined && tmdb.posterUrl.length > 0) {
    const url = tmdb.posterUrl
    container.addMediaGalleryComponents((media) => media.addItems((item) => item.setURL(url)))
  } else {
    try {
      posterFile = await readFile(FALLBACK_POSTER_PATH)
      container.addMediaGalleryComponents((media) => media.addItems((item) => item.setURL(FALLBACK_POSTER_REF)))
    } catch (err: unknown) {
      log.warn(
        err instanceof Error ? err : new Error(String(err)),
        'fallback poster unavailable, sending webhook without attachment'
      )
    }
  }

  const overview = tmdb?.overview ?? ''
  if (overview.length > 0) {
    addSeparator(container)
    // Keep the whole message under the total cap by shrinking the overview.
    const fixedEstimate = title.length + data.torrentName.length + data.username.length + data.label.length + 1500
    const overviewBudget = Math.max(500, Math.min(DISCORD_TEXT_LIMIT, DISCORD_TOTAL_LIMIT - fixedEstimate))
    container.addTextDisplayComponents((text: TextDisplayBuilder) =>
      text.setContent(escapeDiscordText(truncateText(overview, overviewBudget)))
    )
  }

  if (tmdb !== null && tmdb !== undefined) {
    addSeparator(container)

    if (tmdb.genres.length > 0) {
      const genres = truncateText(tmdb.genres.join(', '), 300)
      container.addTextDisplayComponents((text: TextDisplayBuilder) =>
        text.setContent(`${bold(t('discord.genres'))}: ${escapeDiscordText(genres)}`)
      )
    }

    const metaParts: string[] = []
    if (tmdb.runtime !== null && tmdb.runtime !== undefined && tmdb.runtime > 0) {
      metaParts.push(`${t('discord.runtime')}: ${tmdb.runtime} ${t('discord.min')}`)
    }
    if (tmdb.voteAverage !== null && tmdb.voteAverage !== undefined && tmdb.voteAverage > 0) {
      metaParts.push(`${t('discord.rating')}: ${tmdb.voteAverage.toFixed(1)}/10`)
    }
    if (tmdb.releaseDate !== null && tmdb.releaseDate !== undefined && tmdb.releaseDate.length > 0) {
      metaParts.push(`${t('discord.premiere')}: ${escapeDiscordText(tmdb.releaseDate)}`)
    }
    if (metaParts.length > 0) {
      container.addTextDisplayComponents((text: TextDisplayBuilder) => text.setContent(metaParts.join(' · ')))
    }
  }

  addSeparator(container)
  // The stored add-time resolution wins; the shared ranker tags are the fallback.
  const meta = parseTorrentName(data.torrentName)
  const resolution = data.resolution ?? meta.resolution
  const infoParts: string[] = [
    `${bold(t('discord.size'))}: ${formatSize(data.sizeBytes)}`,
    `${bold(t('discord.category'))}: ${savePathLabel(data.savePath, t)}`,
    `${bold(t('discord.downloadedBy'))}: ${escapeDiscordText(data.username)}`
  ]
  if (resolution !== null) infoParts.push(`${bold(t('discord.resolution'))}: ${escapeDiscordText(resolution)}`)
  if (meta.source !== null) infoParts.push(`${bold(t('discord.source'))}: ${meta.source}`)
  if (meta.language !== null) infoParts.push(`${bold(t('discord.language'))}: ${meta.language}`)
  if (meta.codec !== null) infoParts.push(`${bold(t('discord.codec'))}: ${meta.codec}`)
  container.addTextDisplayComponents((text: TextDisplayBuilder) => text.setContent(infoParts.join(' · ')))

  if (data.torrentName.length > 0) {
    container.addTextDisplayComponents((text: TextDisplayBuilder) =>
      text.setContent(
        `${bold(t('discord.release'))}: ${escapeDiscordText(truncateText(data.torrentName, DISCORD_RELEASE_LIMIT))}`
      )
    )
  }

  const components: (APIContainerComponent | APITextDisplayComponent)[] = [container.toJSON()]

  let allowedMentions: ComponentsPayload['allowed_mentions'] = { parse: [] }
  if (data.discordId !== null && data.discordId.length > 0 && (await isDiscordMentionsEnabled())) {
    const mentionText = new TextDisplayBuilder().setContent(`<@${data.discordId}>`)
    components.unshift(mentionText.toJSON())
    allowedMentions = { users: [data.discordId] }
  }

  const payload: ComponentsPayload = {
    components,
    flags: MessageFlags.IsComponentsV2,
    allowed_mentions: allowedMentions
  }

  const files: OutgoingFile[] =
    posterFile !== null ? [{ data: posterFile, name: FALLBACK_POSTER_NAME, contentType: 'image/png' as const }] : []

  await postWebhook(webhookUrl, payload, files)
}

export async function notifyRequestPending(data: RequestPendingData): Promise<void> {
  const config = useRuntimeConfig()
  const webhookUrl = config.discordWebhookUrl as string
  if (!webhookUrl) return

  const locale = await getDiscordLocale()
  const t = createT(locale)

  let tmdb: TmdbMeta | null = null
  try {
    tmdb = await fetchTmdbMeta(data.mediaId, data.mediaType)
  } catch {
    // ignore
  }

  const rawTitle = (tmdb?.title ?? data.mediaTitle ?? '').trim() || data.mediaTitle
  const title = escapeDiscordText(truncateText(rawTitle, DISCORD_TITLE_LIMIT))
  const typeEmoji = data.mediaType === 'movie' ? t('discord.movies') : t('discord.series')

  const container = new ContainerBuilder()
  container.setAccentColor(REQUEST_ACCENT)

  container.addTextDisplayComponents((text: TextDisplayBuilder) =>
    text.setContent(bold(escapeDiscordText(t('discord.newRequest'))))
  )

  addSeparator(container)

  container.addTextDisplayComponents((text: TextDisplayBuilder) =>
    text.setContent(heading(`${title}`, HeadingLevel.One))
  )

  if (tmdb !== null && tmdb.posterUrl !== null && tmdb.posterUrl.length > 0) {
    const posterUrl = tmdb.posterUrl
    container.addMediaGalleryComponents((media) => media.addItems((item) => item.setURL(posterUrl)))
  }

  addSeparator(container)

  const infoParts: string[] = [
    `${bold(t('discord.type'))}: ${typeEmoji}`,
    `${bold(t('discord.requestedBy'))}: ${escapeDiscordText(data.username)}`
  ]
  if (data.userNote !== null && data.userNote.length > 0) {
    infoParts.push(`${bold(t('discord.message'))}: ${escapeDiscordText(truncateText(data.userNote, 500))}`)
  }
  container.addTextDisplayComponents((text: TextDisplayBuilder) => text.setContent(infoParts.join('\n')))

  const payload: ComponentsPayload = {
    components: [container.toJSON()],
    flags: MessageFlags.IsComponentsV2,
    allowed_mentions: { parse: [] }
  }

  await postWebhook(webhookUrl, payload, [])
}
