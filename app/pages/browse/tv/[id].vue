<template>
  <div v-if="pending" class="space-y-8">
    <div class="flex flex-col gap-8 lg:flex-row">
      <USkeleton class="mx-auto h-72 w-48 rounded-xl lg:mx-0 lg:h-96 lg:w-64" />
      <div class="flex-1 space-y-4">
        <USkeleton class="h-8 w-2/3 rounded" />
        <USkeleton class="h-5 w-1/3 rounded" />
        <div class="flex gap-3">
          <USkeleton class="h-4 w-12 rounded" />
          <USkeleton class="h-4 w-16 rounded" />
          <USkeleton class="h-4 w-8 rounded" />
        </div>
        <div class="flex gap-2">
          <USkeleton class="h-6 w-16 rounded-full" />
          <USkeleton class="h-6 w-20 rounded-full" />
          <USkeleton class="h-6 w-14 rounded-full" />
        </div>
        <div class="space-y-2">
          <USkeleton class="h-4 w-full rounded" />
          <USkeleton class="h-4 w-full rounded" />
          <USkeleton class="h-4 w-3/4 rounded" />
        </div>
        <USkeleton class="h-9 w-36 rounded-lg" />
      </div>
    </div>
    <div class="space-y-4">
      <div class="flex items-center gap-4">
        <USkeleton class="h-6 w-20 rounded" />
        <USkeleton class="h-9 w-48 rounded-lg" />
      </div>
      <USkeleton class="h-24 w-full rounded-xl" />
      <USkeleton class="h-32 w-full rounded-xl" />
      <USkeleton class="h-32 w-full rounded-xl" />
    </div>
  </div>

  <div v-else-if="error || !show" class="rounded-xl bg-red-500/10 p-6 text-center text-red-500 dark:text-red-400">
    {{ t('tv.loadError') }}
  </div>

  <div v-else>
    <div
      v-if="show.backdropUrl"
      class="fixed top-0 left-0 z-0 h-[70vh] w-full bg-cover bg-center"
      :style="{
        backgroundImage: `url(${show.backdropUrl})`,
        maskImage: 'linear-gradient(to bottom, black 60%, transparent 100%)',
        WebkitMaskImage: 'linear-gradient(to bottom, black 60%, transparent 100%)'
      }"
    >
      <div
        class="h-full w-full bg-linear-to-b from-white/70 via-white/40 to-[var(--ui-bg)] dark:from-black/95 dark:via-black/70"
      />
    </div>

    <div class="relative z-10 flex flex-col gap-8 lg:flex-row">
      <div class="flex-shrink-0">
        <img
          v-if="show.posterUrl"
          :src="show.posterUrl"
          :alt="show.name"
          class="mx-auto w-48 rounded-xl shadow-2xl lg:mx-0 lg:w-64"
        />
      </div>

      <div class="flex-1">
        <h1 class="text-3xl font-bold text-zinc-900 dark:text-white lg:text-4xl">{{ show.name }}</h1>
        <p v-if="show.originalName !== show.name" class="mt-1 text-lg text-zinc-500 dark:text-zinc-400">
          {{ show.originalName }}
        </p>

        <div class="mt-4 flex flex-wrap items-center gap-3">
          <span v-if="show.firstAirDate" class="text-zinc-600 dark:text-zinc-300">{{
            show.firstAirDate.slice(0, 4)
          }}</span>
          <span class="text-zinc-600 dark:text-zinc-300">
            {{ show.numberOfSeasons }} {{ show.numberOfSeasons === 1 ? t('tv.season_one') : t('tv.season_many') }}
          </span>
          <span v-if="show.rating > 0" class="flex items-center gap-1 text-amber-500">
            <UIcon name="i-lucide-star" class="size-4" />
            {{ show.rating.toFixed(1) }}
          </span>
        </div>

        <div class="mt-3 flex flex-wrap gap-2">
          <span
            v-for="genre in show.genres"
            :key="genre.id"
            class="rounded-full bg-zinc-200/50 px-3 py-1 text-xs font-medium text-zinc-700 dark:bg-zinc-700/50 dark:text-zinc-300"
          >
            {{ genre.name }}
          </span>
        </div>

        <p class="mt-6 leading-relaxed text-zinc-700 dark:text-zinc-300">{{ show.overview }}</p>

        <div class="mt-4">
          <UButton
            v-if="!alreadyRequested"
            color="primary"
            variant="outline"
            icon="i-lucide-message-square-plus"
            :loading="requesting"
            @click="requestTitle"
          >
            {{ t('requests.requestThis') }}
          </UButton>
          <span v-else class="inline-flex items-center gap-2 text-sm text-amber-500">
            <UIcon name="i-lucide-check-circle" class="size-4" />
            {{ t('requests.alreadyRequested') }}
          </span>
        </div>
      </div>
    </div>

    <div class="relative z-10 mt-10">
      <div class="mb-6 flex items-center gap-4">
        <h2 class="text-xl font-bold text-zinc-900 dark:text-white">{{ t('tv.seasons') }}</h2>
        <USelect v-model="selectedSeason" :items="seasonOptions" size="md" class="w-48" />
      </div>

      <div v-if="seasonPending" class="space-y-3">
        <USkeleton class="h-24 w-full rounded-xl" />
        <USkeleton class="h-32 w-full rounded-xl" />
        <USkeleton class="h-32 w-full rounded-xl" />
        <USkeleton class="h-32 w-full rounded-xl" />
      </div>

      <div
        v-else-if="seasonLimitInfo"
        class="rounded-xl border border-amber-500/50 bg-amber-500/10 p-8 text-center dark:bg-amber-500/5"
      >
        <UIcon name="i-lucide-alert-triangle" class="mx-auto mb-3 size-10 text-amber-500" />
        <h3 class="mb-2 text-lg font-bold text-amber-600 dark:text-amber-400">
          {{ t('browse.limitReached') }}
        </h3>
        <div class="mb-2 flex items-center justify-center gap-4 text-sm text-zinc-700 dark:text-zinc-300">
          <span>{{
            t('browse.limitActive', { active: seasonLimitInfo.activeCount, limit: seasonLimitInfo.limit })
          }}</span>
          <span class="text-zinc-400 dark:text-zinc-500">·</span>
          <span>{{ t('browse.limitToday', { today: seasonLimitInfo.todayCount, limit: seasonLimitInfo.limit }) }}</span>
        </div>
        <p class="text-xs text-zinc-500 dark:text-zinc-400">{{ t('browse.limitResetInfo') }}</p>
      </div>

      <div v-else-if="seasonData">
        <div v-if="seasonData.seasonPacks.length > 0" class="mb-6">
          <h3 class="mb-3 text-sm font-semibold text-zinc-500 dark:text-zinc-400">{{ t('tv.seasonPacks') }}</h3>
          <div class="space-y-2">
            <div
              v-for="(pack, idx) in seasonData.seasonPacks"
              :key="'pack-' + idx"
              class="flex flex-col gap-3 rounded-xl border border-purple-500/30 bg-purple-500/5 p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div class="flex-1 min-w-0">
                <span class="flex items-center gap-2 text-xs font-bold text-purple-500">
                  <UIcon name="i-lucide-layers" class="size-3" />
                  {{ t('tv.seasonPack') }}
                </span>
                <p class="mt-1 line-clamp-1 text-sm text-zinc-800 dark:text-zinc-200">{{ pack.title }}</p>
                <div class="mt-1 flex items-center gap-3 text-xs text-zinc-500 dark:text-zinc-400">
                  <span>{{ pack.sizeFormatted }}</span>
                  <span class="flex items-center gap-1 text-emerald-500">
                    <UIcon name="i-lucide-arrow-up" class="size-3" />
                    {{ pack.seeders }}
                  </span>
                  <span>{{ pack.indexer }}</span>
                </div>
              </div>
              <UButton
                :color="isPrivateLimitExceeded(pack.isPrivate) ? 'error' : 'warning'"
                icon="i-lucide-download"
                size="sm"
                class="cursor-pointer"
                :loading="downloadingPackIdx === idx"
                :disabled="
                  (pack.magnetLink === null && pack.guid === null && pack.downloadUrl === null) ||
                  isPrivateLimitExceeded(pack.isPrivate)
                "
                @click="
                  downloadTorrent(
                    pack.magnetLink,
                    `${show?.name ?? ''} S${String(selectedSeason).padStart(2, '0')} Season Pack`,
                    String(idx),
                    'pack',
                    pack.guid,
                    pack.indexer,
                    pack.downloadUrl,
                    pack.size
                  )
                "
              >
                {{ isPrivateLimitExceeded(pack.isPrivate) ? t('tv.limitReached') : t('tv.downloadSeason') }}
              </UButton>
              <UButton
                v-if="isDev"
                size="xs"
                color="neutral"
                variant="ghost"
                icon="i-lucide-bug"
                @click="toggleDebug(`pack-${idx}`)"
              />
              <div
                v-if="isDev && debugOpenKey === `pack-${idx}`"
                class="w-full rounded-lg border border-zinc-200 bg-zinc-50 p-3 font-mono text-xs dark:border-zinc-700 dark:bg-zinc-900"
              >
                <div class="mb-2 flex items-center gap-2 font-bold text-zinc-500 dark:text-zinc-400">
                  <UIcon name="i-lucide-bug" class="size-3" />
                  Dev Info
                </div>
                <div class="space-y-1.5">
                  <div class="flex items-center gap-2">
                    <span class="w-24 text-zinc-400">indexer:</span>
                    <span class="text-zinc-700 dark:text-zinc-300">{{ pack.indexer }}</span>
                  </div>
                  <div class="flex items-center gap-2">
                    <span class="w-24 text-zinc-400">magnetLink:</span>
                    <span
                      class="max-w-xs truncate"
                      :class="pack.magnetLink ? 'text-emerald-600 dark:text-emerald-400' : 'text-zinc-400'"
                    >
                      {{ pack.magnetLink ?? '-' }}
                    </span>
                    <UButton
                      v-if="pack.magnetLink"
                      size="xs"
                      color="neutral"
                      variant="ghost"
                      icon="i-lucide-copy"
                      @click="copyToClipboard(pack.magnetLink!)"
                    />
                  </div>
                  <div class="flex items-center gap-2">
                    <span class="w-24 text-zinc-400">downloadUrl:</span>
                    <span
                      class="max-w-xs truncate"
                      :class="pack.downloadUrl ? 'text-emerald-600 dark:text-emerald-400' : 'text-zinc-400'"
                    >
                      {{ pack.downloadUrl ?? '-' }}
                    </span>
                    <UButton
                      v-if="pack.downloadUrl"
                      size="xs"
                      color="neutral"
                      variant="ghost"
                      icon="i-lucide-copy"
                      @click="copyToClipboard(pack.downloadUrl!)"
                    />
                  </div>
                  <div class="flex items-center gap-2">
                    <span class="w-24 text-zinc-400">guid:</span>
                    <span
                      class="max-w-xs truncate"
                      :class="pack.guid ? 'text-emerald-600 dark:text-emerald-400' : 'text-zinc-400'"
                    >
                      {{ pack.guid ?? '-' }}
                    </span>
                    <UButton
                      v-if="pack.guid"
                      size="xs"
                      color="neutral"
                      variant="ghost"
                      icon="i-lucide-copy"
                      @click="copyToClipboard(pack.guid!)"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="space-y-3">
          <div
            v-for="ep in seasonData.episodes"
            :key="ep.id"
            class="rounded-xl border border-zinc-200 bg-white/50 p-4 dark:border-zinc-700 dark:bg-zinc-800/50"
          >
            <div class="flex gap-4">
              <div v-if="ep.stillUrl" class="hidden w-32 flex-shrink-0 sm:block">
                <img :src="ep.stillUrl" :alt="ep.name" class="w-full rounded-lg object-cover" loading="lazy" />
              </div>
              <div class="flex-1">
                <div class="flex items-center gap-2">
                  <span class="text-sm font-bold text-amber-500">E{{ String(ep.episodeNumber).padStart(2, '0') }}</span>
                  <span v-if="ep.rating > 0" class="flex items-center gap-1 text-xs text-amber-500">
                    <UIcon name="i-lucide-star" class="size-3" />
                    {{ ep.rating.toFixed(1) }}
                  </span>
                  <span v-if="ep.runtime" class="text-xs text-zinc-500 dark:text-zinc-400"
                    >{{ ep.runtime }} {{ t('common.min') }}</span
                  >
                </div>
                <h3 class="mt-1 font-semibold text-zinc-900 dark:text-white">{{ ep.name }}</h3>
                <p class="mt-1 line-clamp-2 text-sm text-zinc-600 dark:text-zinc-400">{{ ep.overview }}</p>

                <div v-if="ep.torrents.length > 0" class="mt-3 space-y-1">
                  <div
                    v-for="(tr, tIdx) in ep.torrents.slice(0, 3)"
                    :key="tIdx"
                    class="flex items-center gap-3 rounded-lg p-2 transition-colors"
                    :class="
                      tr.recommended ? 'bg-amber-500/5 ring-1 ring-amber-500/30' : 'bg-zinc-100/50 dark:bg-zinc-700/30'
                    "
                  >
                    <span
                      class="text-xs font-bold"
                      :class="
                        tr.percentage >= 80
                          ? 'text-emerald-500'
                          : tr.percentage >= 60
                            ? 'text-amber-500'
                            : 'text-zinc-500'
                      "
                    >
                      {{ tr.percentage }}%
                    </span>
                    <span v-if="tr.recommended" class="text-xs text-amber-500">
                      <UIcon name="i-lucide-star" class="size-3" />
                    </span>
                    <span class="flex-1 truncate text-xs text-zinc-700 dark:text-zinc-300">{{ tr.title }}</span>
                    <span class="text-xs text-zinc-500">{{ tr.sizeFormatted }}</span>
                    <span class="flex items-center gap-1 text-xs text-emerald-500">
                      <UIcon name="i-lucide-arrow-up" class="size-3" />{{ tr.seeders }}
                    </span>
                    <span class="text-xs text-zinc-500">{{ tr.indexer }}</span>
                    <UButton
                      size="xs"
                      :color="isPrivateLimitExceeded(tr.isPrivate) ? 'error' : 'warning'"
                      :variant="isPrivateLimitExceeded(tr.isPrivate) ? 'solid' : 'ghost'"
                      icon="i-lucide-download"
                      class="cursor-pointer"
                      :loading="downloadingKey === `ep-${ep.episodeNumber}-${tIdx}`"
                      :disabled="
                        (tr.magnetLink === null && tr.guid === null && tr.downloadUrl === null) ||
                        isPrivateLimitExceeded(tr.isPrivate)
                      "
                      @click="
                        downloadTorrent(
                          tr.magnetLink,
                          `${show?.name ?? ''} S${String(selectedSeason).padStart(2, '0')}E${String(ep.episodeNumber).padStart(2, '0')} ${ep.name}`,
                          `ep-${ep.episodeNumber}-${tIdx}`,
                          undefined,
                          tr.guid,
                          tr.indexer,
                          tr.downloadUrl,
                          tr.size
                        )
                      "
                    >
                      <template v-if="isPrivateLimitExceeded(tr.isPrivate)">
                        {{ t('tv.limitReached') }}
                      </template>
                    </UButton>
                    <UButton
                      v-if="isDev"
                      size="xs"
                      color="neutral"
                      variant="ghost"
                      icon="i-lucide-bug"
                      @click="toggleDebug(`ep-${ep.episodeNumber}-${tIdx}`)"
                    />
                    <div
                      v-if="isDev && debugOpenKey === `ep-${ep.episodeNumber}-${tIdx}`"
                      class="w-full rounded-lg border border-zinc-200 bg-zinc-50 p-3 font-mono text-xs dark:border-zinc-700 dark:bg-zinc-900"
                    >
                      <div class="mb-2 flex items-center gap-2 font-bold text-zinc-500 dark:text-zinc-400">
                        <UIcon name="i-lucide-bug" class="size-3" />
                        Dev Info
                      </div>
                      <div class="space-y-1.5">
                        <div class="flex items-center gap-2">
                          <span class="w-24 text-zinc-400">indexer:</span>
                          <span class="text-zinc-700 dark:text-zinc-300">{{ tr.indexer }}</span>
                        </div>
                        <div class="flex items-center gap-2">
                          <span class="w-24 text-zinc-400">magnetLink:</span>
                          <span
                            class="max-w-xs truncate"
                            :class="tr.magnetLink ? 'text-emerald-600 dark:text-emerald-400' : 'text-zinc-400'"
                          >
                            {{ tr.magnetLink ?? '-' }}
                          </span>
                          <UButton
                            v-if="tr.magnetLink"
                            size="xs"
                            color="neutral"
                            variant="ghost"
                            icon="i-lucide-copy"
                            @click="copyToClipboard(tr.magnetLink!)"
                          />
                        </div>
                        <div class="flex items-center gap-2">
                          <span class="w-24 text-zinc-400">downloadUrl:</span>
                          <span
                            class="max-w-xs truncate"
                            :class="tr.downloadUrl ? 'text-emerald-600 dark:text-emerald-400' : 'text-zinc-400'"
                          >
                            {{ tr.downloadUrl ?? '-' }}
                          </span>
                          <UButton
                            v-if="tr.downloadUrl"
                            size="xs"
                            color="neutral"
                            variant="ghost"
                            icon="i-lucide-copy"
                            @click="copyToClipboard(tr.downloadUrl!)"
                          />
                        </div>
                        <div class="flex items-center gap-2">
                          <span class="w-24 text-zinc-400">guid:</span>
                          <span
                            class="max-w-xs truncate"
                            :class="tr.guid ? 'text-emerald-600 dark:text-emerald-400' : 'text-zinc-400'"
                          >
                            {{ tr.guid ?? '-' }}
                          </span>
                          <UButton
                            v-if="tr.guid"
                            size="xs"
                            color="neutral"
                            variant="ghost"
                            icon="i-lucide-copy"
                            @click="copyToClipboard(tr.guid!)"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <p v-else class="mt-2 text-xs text-zinc-400 dark:text-zinc-500">{{ t('tv.noTorrents') }}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
interface SeasonPack {
  title: string
  size: number
  sizeFormatted: string
  seeders: number
  leechers: number
  magnetLink: string | null
  downloadUrl: string | null
  guid: string | null
  indexer: string
  resolution: string | null
  language: string | null
  isSeasonPack: boolean
  isPrivate: boolean
  percentage: number
}

interface EpisodeTorrent {
  title: string
  size: number
  sizeFormatted: string
  seeders: number
  leechers: number
  magnetLink: string | null
  downloadUrl: string | null
  guid: string | null
  indexer: string
  score: number
  percentage: number
  recommended: boolean
  resolution: string | null
  language: string | null
  isPrivate: boolean
}

interface Episode {
  id: number
  episodeNumber: number
  name: string
  overview: string
  stillUrl: string | null
  airDate: string
  rating: number
  runtime: number | null
  torrents: EpisodeTorrent[]
}

interface ShowData {
  id: number
  name: string
  originalName: string
  overview: string
  posterUrl: string | null
  backdropUrl: string | null
  firstAirDate: string
  rating: number
  genres: Array<{ id: number; name: string }>
  numberOfSeasons: number
  numberOfEpisodes: number
  seasons: Array<{
    id: number
    seasonNumber: number
    name: string
    posterUrl: string | null
    episodeCount: number
  }>
}

interface SeasonData {
  season: { seasonNumber: number; name: string; posterUrl: string | null }
  episodes: Episode[]
  seasonPacks: SeasonPack[]
}

const route = useRoute()
const selectedSeason = ref(1)
const downloadingKey = ref<string | null>(null)
const downloadingPackIdx = ref<number | null>(null)
const requesting = ref(false)
const alreadyRequested = ref(false)
const debugOpenKey = ref<string | null>(null)
const { t, locale } = useI18n()
const { user } = useUserSession()

const isDev = computed(() => import.meta.dev && user.value?.role === 'admin')

function toggleDebug(key: string) {
  debugOpenKey.value = debugOpenKey.value === key ? null : key
}

async function copyToClipboard(text: string) {
  await navigator.clipboard.writeText(text)
}

const {
  data: showData,
  pending,
  error
} = await useFetch<{ show: ShowData }>(
  computed(() => `/api/browse/tv/${route.params.id}?locale=${locale.value}`),
  { watch: [locale] }
)

const show = computed(() => showData.value?.show ?? null)
const { data: limits } = useFetch('/api/user/limits')

const seasonOptions = computed(() => {
  if (show.value === null) return []
  return show.value.seasons.map((s) => ({
    label: `${s.name} (${s.episodeCount} ${t('tv.episodes')})`,
    value: s.seasonNumber
  }))
})

const {
  data: seasonData,
  pending: seasonPending,
  error: seasonError
} = useLazyFetch<SeasonData>(
  computed(() => `/api/browse/tv/${route.params.id}/season/${selectedSeason.value}?locale=${locale.value}`),
  { watch: [selectedSeason, locale] }
)

const seasonLimitInfo = computed(() => {
  if (seasonError.value === null || seasonError.value === undefined) return null
  const err = seasonError.value as unknown as Record<string, unknown>
  const status = err.status ?? err.statusCode
  if (status !== 429) return null
  const body = err.data as Record<string, unknown> | undefined
  if (body !== null && body !== undefined && 'activeCount' in body) return body
  const nested = body?.data as Record<string, unknown> | undefined
  if (nested !== null && nested !== undefined && 'activeCount' in nested) return nested
  return null
})

function isPrivateLimitExceeded(isPrivate: boolean): boolean {
  if (!isPrivate) return false
  if (!limits.value) return false
  return limits.value.todayPrivate >= limits.value.privateLimit
}

async function downloadTorrent(
  magnetLink: string | null,
  label: string,
  key: string,
  type?: string,
  guid?: string | null,
  indexer?: string,
  downloadUrl?: string | null,
  torrentSize?: number
) {
  const hasMagnet = magnetLink !== null && magnetLink.length > 0
  const hasGuid = guid !== null && guid !== undefined && guid.length > 0
  const hasDownloadUrl = downloadUrl !== null && downloadUrl !== undefined && downloadUrl.length > 0
  if (!hasMagnet && !hasGuid && !hasDownloadUrl) return

  if (type === 'pack') {
    downloadingPackIdx.value = Number(key)
  } else {
    downloadingKey.value = key
  }

  try {
    await $fetch('/api/browse/download', {
      method: 'POST',
      body: {
        magnetLink: magnetLink ?? '',
        downloadUrl: downloadUrl ?? '',
        guid: guid ?? '',
        indexer: indexer ?? '',
        label,
        savePath: 'series',
        tmdbId: show.value?.id ?? null,
        mediaType: 'tv',
        torrentSize: torrentSize ?? 0
      }
    })
    const toast = useToast()
    toast.add({ title: t('download.added'), description: t('download.addedDesc', { label }), color: 'success' })
    navigateTo('/dashboard/downloads')
  } catch (err) {
    const toast = useToast()
    const msg = err instanceof Error ? err.message : t('download.errorDesc')
    toast.add({ title: t('download.error'), description: msg, color: 'error' })
  } finally {
    downloadingKey.value = null
    downloadingPackIdx.value = null
  }
}

watchEffect(async () => {
  if (!show.value) return
  try {
    const res = await $fetch<{ requested: boolean }>(`/api/requests/mine?mediaType=tv&mediaId=${show.value.id}`)
    alreadyRequested.value = res.requested
  } catch {
    // not logged in or error
  }
})

async function requestTitle() {
  if (!show.value) return
  requesting.value = true
  try {
    await $fetch('/api/requests/post', {
      method: 'POST',
      body: {
        mediaType: 'tv',
        mediaId: show.value.id,
        mediaTitle: show.value.name,
        mediaPoster: show.value.posterUrl
      }
    })
    alreadyRequested.value = true
    const toast = useToast()
    toast.add({
      title: t('requests.requestSuccess'),
      description: t('requests.requestSuccessDesc'),
      color: 'success'
    })
  } catch (err) {
    const toast = useToast()
    const msg = err instanceof Error ? err.message : t('requests.alreadyRequested')
    toast.add({ title: t('requests.alreadyRequested'), description: msg, color: 'warning' })
  } finally {
    requesting.value = false
  }
}
</script>
