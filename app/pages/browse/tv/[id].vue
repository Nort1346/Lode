<template>
  <div v-if="pending" class="flex justify-center py-20">
    <UIcon name="i-lucide-loader-2" class="size-8 animate-spin text-amber-500" />
  </div>

  <div v-else-if="error || !show" class="rounded-xl bg-red-500/10 p-6 text-center text-red-500 dark:text-red-400">
    {{ t('tv.loadError') }}
  </div>

  <div v-else>
    <div
      v-if="show.backdropUrl"
      class="fixed top-0 left-0 -z-10 h-[50vh] w-full bg-cover bg-center"
      :style="{ backgroundImage: `url(${show.backdropUrl})` }"
    >
      <div class="h-full w-full bg-gradient-to-b from-black/60 via-black/40 to-[var(--ui-bg)]" />
    </div>

    <div class="flex flex-col gap-8 lg:flex-row">
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
      </div>
    </div>

    <div class="mt-10">
      <div class="mb-6 flex items-center gap-4">
        <h2 class="text-xl font-bold text-zinc-900 dark:text-white">{{ t('tv.seasons') }}</h2>
        <USelect v-model="selectedSeason" :items="seasonOptions" size="md" class="w-48" />
      </div>

      <div v-if="seasonPending" class="flex justify-center py-10">
        <UIcon name="i-lucide-loader-2" class="size-6 animate-spin text-amber-500" />
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
                </div>
              </div>
              <UButton
                color="warning"
                icon="i-lucide-download"
                size="sm"
                :loading="downloadingPackIdx === idx"
                @click="
                  downloadTorrent(
                    pack.magnetLink,
                    `${show?.name ?? ''} S${String(selectedSeason).padStart(2, '0')} Season Pack`,
                    String(idx),
                    'pack'
                  )
                "
              >
                {{ t('tv.downloadSeason') }}
              </UButton>
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
                      :class="tr.score >= 80 ? 'text-emerald-500' : tr.score >= 60 ? 'text-amber-500' : 'text-zinc-500'"
                    >
                      {{ tr.score }}
                    </span>
                    <span v-if="tr.recommended" class="text-xs text-amber-500">
                      <UIcon name="i-lucide-star" class="size-3" />
                    </span>
                    <span class="flex-1 truncate text-xs text-zinc-700 dark:text-zinc-300">{{ tr.title }}</span>
                    <span class="text-xs text-zinc-500">{{ tr.sizeFormatted }}</span>
                    <span class="flex items-center gap-1 text-xs text-emerald-500">
                      <UIcon name="i-lucide-arrow-up" class="size-3" />{{ tr.seeders }}
                    </span>
                    <UButton
                      size="xs"
                      color="warning"
                      variant="ghost"
                      icon="i-lucide-download"
                      :loading="downloadingKey === `ep-${ep.episodeNumber}-${tIdx}`"
                      @click="
                        downloadTorrent(
                          tr.magnetLink,
                          `${show?.name ?? ''} S${String(selectedSeason).padStart(2, '0')}E${String(ep.episodeNumber).padStart(2, '0')} ${ep.name}`,
                          `ep-${ep.episodeNumber}-${tIdx}`
                        )
                      "
                    />
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
  resolution: string | null
  language: string | null
  isSeasonPack: boolean
}

interface EpisodeTorrent {
  title: string
  size: number
  sizeFormatted: string
  seeders: number
  leechers: number
  magnetLink: string | null
  score: number
  recommended: boolean
  resolution: string | null
  language: string | null
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
const { t, locale } = useI18n()

const {
  data: showData,
  pending,
  error
} = await useFetch<{ show: ShowData }>(
  computed(() => `/api/browse/tv/${route.params.id}?locale=${locale.value}`),
  { watch: [locale] }
)

const show = computed(() => showData.value?.show ?? null)

const seasonOptions = computed(() => {
  if (show.value === null) return []
  return show.value.seasons.map((s) => ({
    label: `${s.name} (${s.episodeCount} ${t('tv.episodes')})`,
    value: s.seasonNumber
  }))
})

const { data: seasonData, pending: seasonPending } = await useFetch<SeasonData>(
  computed(() => `/api/browse/tv/${route.params.id}/season/${selectedSeason.value}?locale=${locale.value}`),
  { watch: [selectedSeason, locale] }
)

async function downloadTorrent(magnetLink: string | null, label: string, key: string, type?: string) {
  if (magnetLink === null) return

  if (type === 'pack') {
    downloadingPackIdx.value = Number(key)
  } else {
    downloadingKey.value = key
  }

  try {
    await $fetch('/api/browse/download', {
      method: 'POST',
      body: {
        magnetLink,
        label,
        savePath: 'series'
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
</script>
