import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { ContainerBuilder, TextDisplayBuilder } from '@discordjs/builders'
import type { SeparatorBuilder } from '@discordjs/builders'
import { bold, heading, HeadingLevel } from '@discordjs/formatters'
import { REST } from '@discordjs/rest'
import { Routes, MessageFlags } from 'discord-api-types/v10'
import type { APIContainerComponent, APITextDisplayComponent } from 'discord-api-types/v10'
import { settings } from '#server/database/schema'
import { eq } from 'drizzle-orm'
import { getMovieDetails, getTvShowDetails, getImageUrl } from './tmdb'
import { createLogger } from '#server/utils/logger'
import { createT, DISCORD_LOCALE_OPTIONS } from '#server/utils/i18n-server'
import type { DiscordLocale } from '#server/utils/i18n-server'

const log = createLogger('Discord')

export interface DownloadCompleteData {
  id: string
  label: string
  torrentName: string
  savePath: string
  sizeBytes: number
  completedAt: string
  username: string
  tmdbId: number | null
  mediaType: string | null
  discordId: string | null
}

export interface TmdbMeta {
  title: string
  overview: string
  posterUrl: string | null
  backdropUrl: string | null
  runtime: number | null
  genres: string[]
  voteAverage: number
  releaseDate: string
}

const FALLBACK_POSTER_NAME = 'poster-not-found.png'
const FALLBACK_POSTER_PATH = resolve(process.cwd(), 'public', FALLBACK_POSTER_NAME)
const FALLBACK_POSTER_REF = `attachment://${FALLBACK_POSTER_NAME}`

export function isDiscordMentionsEnabled(): boolean {
  const db = useDb()
  const row = db.select().from(settings).where(eq(settings.key, 'discord_mentions_enabled')).get()
  return row?.value === 'true'
}

export function getDiscordLocale(): DiscordLocale {
  const db = useDb()
  const row = db.select().from(settings).where(eq(settings.key, 'discord_locale')).get()
  const val = row?.value
  if (val !== undefined && val !== null && DISCORD_LOCALE_OPTIONS.includes(val as DiscordLocale)) {
    return val as DiscordLocale
  }
  return 'pl'
}

export async function fetchTmdbMeta(tmdbId: number, mediaType: string): Promise<TmdbMeta | null> {
  const locale = getDiscordLocale()
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

function formatSize(bytes: number): string {
  if (bytes <= 0) return '-'
  const gb = bytes / (1024 * 1024 * 1024)
  if (gb >= 1) return `${gb.toFixed(2)} GB`
  const mb = bytes / (1024 * 1024)
  return `${mb.toFixed(1)} MB`
}

function savePathLabel(savePath: string, t: ReturnType<typeof createT>): string {
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

interface TorrentMeta {
  resolution: string | null
  source: string | null
  language: string | null
  codec: string | null
}

function parseTorrentName(name: string): TorrentMeta {
  const lower = name.toLowerCase()

  let resolution: string | null = null
  if (/\b(2160p|4k|uhd)\b/.test(lower)) resolution = '4K'
  else if (/\b1080p\b/.test(lower)) resolution = '1080p'
  else if (/\b720p\b/.test(lower)) resolution = '720p'
  else if (/\b480p\b/.test(lower)) resolution = '480p'

  let source: string | null = null
  if (/\b(bluray|blu-ray|bdrip|bdremux)\b/.test(lower)) source = 'BluRay'
  else if (/\b(web-dl|webdl)\b/.test(lower)) source = 'WEB-DL'
  else if (/\b(webrip|web-rip)\b/.test(lower)) source = 'WEBRip'
  else if (/\b(hdrip)\b/.test(lower)) source = 'HDRip'
  else if (/\b(dvdrip|dvd)\b/.test(lower)) source = 'DVD'
  else if (/\b(hdtv)\b/.test(lower)) source = 'HDTV'
  else if (/\b(remux)\b/.test(lower)) source = 'Remux'

  let language: string | null = null
  if (/\b(pldub|polish)\b/.test(lower)) language = 'PL'
  else if (/\b(lektor|pl)\b/.test(lower)) language = 'PL'
  else if (/\b(dual[\s.]?audio|dual[\s.]?audio)\b/.test(lower)) language = 'Dual'
  else if (/\b(eng|english)\b/.test(lower)) language = 'EN'

  let codec: string | null = null
  if (/\bx264|h\.?264|avc\b/.test(lower)) codec = 'x264'
  else if (/\bx265|h\.?265|hevc\b/.test(lower)) codec = 'x265'
  else if (/\bxvid\b/.test(lower)) codec = 'XviD'
  else if (/\bav1\b/.test(lower)) codec = 'AV1'

  return { resolution, source, language, codec }
}

export async function sendDownloadCompleteWebhook(data: DownloadCompleteData): Promise<void> {
  const config = useRuntimeConfig()
  const webhookUrl = config.discordWebhookUrl as string
  if (!webhookUrl) {
    log.warn('webhook URL not configured')
    return
  }

  const locale = getDiscordLocale()
  const t = createT(locale)

  let tmdb: TmdbMeta | null = null
  if (data.tmdbId !== null && data.mediaType !== null) {
    tmdb = await fetchTmdbMeta(data.tmdbId, data.mediaType)
  }

  const title =
    (tmdb?.title ?? data.label ?? data.torrentName ?? t('discord.downloaded')).trim() || t('discord.downloaded')
  const description = tmdb?.overview ?? ''

  const container = new ContainerBuilder()

  container.addTextDisplayComponents((text: TextDisplayBuilder) => text.setContent(heading(title, HeadingLevel.One)))

  let posterFile: Buffer | null = null
  if (tmdb !== null && tmdb.posterUrl !== null && tmdb.posterUrl !== undefined && tmdb.posterUrl.length > 0) {
    const url = tmdb.posterUrl
    container.addMediaGalleryComponents((media) => media.addItems((item) => item.setURL(url)))
  } else {
    posterFile = readFileSync(FALLBACK_POSTER_PATH)
    container.addMediaGalleryComponents((media) => media.addItems((item) => item.setURL(FALLBACK_POSTER_REF)))
  }

  if (description.length > 0) {
    addSeparator(container)
    const truncated = description.length > 2000 ? description.substring(0, 2000) + '...' : description
    container.addTextDisplayComponents((text: TextDisplayBuilder) => text.setContent(truncated))
  }

  if (tmdb !== null && tmdb !== undefined) {
    addSeparator(container)

    if (tmdb.genres.length > 0) {
      const genres = tmdb.genres.join(', ')
      container.addTextDisplayComponents((text: TextDisplayBuilder) =>
        text.setContent(`${bold(t('discord.genres'))}: ${genres}`)
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
      metaParts.push(`${t('discord.premiere')}: ${tmdb.releaseDate}`)
    }
    if (metaParts.length > 0) {
      container.addTextDisplayComponents((text: TextDisplayBuilder) => text.setContent(metaParts.join(' · ')))
    }
  }

  addSeparator(container)
  const meta = parseTorrentName(data.torrentName)
  const infoParts: string[] = [
    `${bold(t('discord.size'))}: ${formatSize(data.sizeBytes)}`,
    `${bold(t('discord.category'))}: ${savePathLabel(data.savePath, t)}`,
    `${bold(t('discord.downloadedBy'))}: ${data.username}`
  ]
  if (meta.resolution !== null) infoParts.push(`${bold(t('discord.resolution'))}: ${meta.resolution}`)
  if (meta.source !== null) infoParts.push(`${bold(t('discord.source'))}: ${meta.source}`)
  if (meta.language !== null) infoParts.push(`${bold(t('discord.language'))}: ${meta.language}`)
  if (meta.codec !== null) infoParts.push(`${bold(t('discord.codec'))}: ${meta.codec}`)
  container.addTextDisplayComponents((text: TextDisplayBuilder) => text.setContent(infoParts.join(' · ')))

  const match = webhookUrl.match(/\/webhooks\/(\d+)\/(.+?)(?:\/|$)/)
  if (match === null || match[1] === undefined || match[2] === undefined) {
    log.error({ url: webhookUrl }, 'webhook URL format invalid')
    return
  }

  const webhookId = match[1]
  const webhookToken = match[2]
  const rest = new REST({ version: '10' }).setToken(webhookToken)

  const components: (APIContainerComponent | APITextDisplayComponent)[] = [container.toJSON()]

  if (data.discordId !== null && data.discordId.length > 0 && isDiscordMentionsEnabled()) {
    const mentionText = new TextDisplayBuilder().setContent(`<@${data.discordId}>`)
    components.unshift(mentionText.toJSON())
  }

  const payload: {
    components: (APIContainerComponent | APITextDisplayComponent)[]
    flags: number
  } = {
    components,
    flags: MessageFlags.IsComponentsV2
  }

  const files =
    posterFile !== null ? [{ data: posterFile, name: FALLBACK_POSTER_NAME, contentType: 'image/png' as const }] : []

  try {
    await rest.post(Routes.webhook(webhookId, webhookToken), {
      body: payload,
      files,
      query: new URLSearchParams({ with_components: 'true' })
    })
  } catch (err: unknown) {
    log.error(err instanceof Error ? err : new Error(String(err)), 'webhook post failed')
  }
}

export { DISCORD_LOCALE_OPTIONS }

export interface RequestPendingData {
  id: string
  mediaType: 'movie' | 'tv'
  mediaId: number
  mediaTitle: string
  mediaPoster: string | null
  username: string
  userNote: string | null
}

export async function notifyRequestPending(data: RequestPendingData): Promise<void> {
  const config = useRuntimeConfig()
  const webhookUrl = config.discordWebhookUrl as string
  if (!webhookUrl) return

  const locale = getDiscordLocale()
  const t = createT(locale)

  let tmdb: TmdbMeta | null = null
  try {
    tmdb = await fetchTmdbMeta(data.mediaId, data.mediaType)
  } catch {
    // ignore
  }

  const title = (tmdb?.title ?? data.mediaTitle ?? '').trim() || data.mediaTitle
  const typeEmoji = data.mediaType === 'movie' ? t('discord.movies') : t('discord.series')

  const container = new ContainerBuilder()

  container.addTextDisplayComponents((text: TextDisplayBuilder) => text.setContent(bold(t('discord.newRequest'))))

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
    `${bold(t('discord.requestedBy'))}: ${data.username}`
  ]
  if (data.userNote !== null && data.userNote.length > 0) {
    infoParts.push(`${bold(t('discord.message'))}: ${data.userNote}`)
  }
  container.addTextDisplayComponents((text: TextDisplayBuilder) => text.setContent(infoParts.join('\n')))

  const match = webhookUrl.match(/\/webhooks\/(\d+)\/(.+?)(?:\/|$)/)
  if (match === null || match[1] === undefined || match[2] === undefined) return

  const webhookId = match[1]
  const webhookToken = match[2]
  const rest = new REST({ version: '10' }).setToken(webhookToken)

  const payload: {
    components: (APIContainerComponent | APITextDisplayComponent)[]
    flags: number
  } = {
    components: [container.toJSON()],
    flags: MessageFlags.IsComponentsV2
  }

  try {
    await rest.post(Routes.webhook(webhookId, webhookToken), {
      body: payload,
      query: new URLSearchParams({ with_components: 'true' })
    })
  } catch (err: unknown) {
    log.error(err instanceof Error ? err : new Error(String(err)), 'request pending webhook failed')
  }
}
