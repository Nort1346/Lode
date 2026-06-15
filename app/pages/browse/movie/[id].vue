<template>
  <div v-if="pending" class="flex justify-center py-20">
    <UIcon name="i-lucide-loader-2" class="size-8 animate-spin text-amber-500" />
  </div>

  <div v-else-if="error || !movie" class="rounded-xl bg-red-500/10 p-6 text-center text-red-500 dark:text-red-400">
    {{ t('movie.loadError') }}
  </div>

  <div v-else>
    <div
      v-if="movie.backdropUrl"
      class="fixed top-0 left-0 -z-10 h-[50vh] w-full bg-cover bg-center"
      :style="{ backgroundImage: `url(${movie.backdropUrl})` }"
    >
      <div class="h-full w-full bg-gradient-to-b from-black/60 via-black/40 to-[var(--ui-bg)]" />
    </div>

    <div class="flex flex-col gap-8 lg:flex-row">
      <div class="flex-shrink-0">
        <img
          v-if="movie.posterUrl"
          :src="movie.posterUrl"
          :alt="movie.title"
          class="mx-auto w-48 rounded-xl shadow-2xl lg:mx-0 lg:w-64"
        />
      </div>

      <div class="flex-1">
        <h1 class="text-3xl font-bold text-zinc-900 dark:text-white lg:text-4xl">{{ movie.title }}</h1>
        <p v-if="movie.originalTitle !== movie.title" class="mt-1 text-lg text-zinc-500 dark:text-zinc-400">
          {{ movie.originalTitle }}
        </p>

        <div class="mt-4 flex flex-wrap items-center gap-3">
          <span v-if="movie.releaseDate" class="text-zinc-600 dark:text-zinc-300">{{
            movie.releaseDate.slice(0, 4)
          }}</span>
          <span v-if="movie.runtime" class="text-zinc-600 dark:text-zinc-300"
            >{{ movie.runtime }} {{ t('common.min') }}</span
          >
          <span v-if="movie.rating > 0" class="flex items-center gap-1 text-amber-500">
            <UIcon name="i-lucide-star" class="size-4" />
            {{ movie.rating.toFixed(1) }}
          </span>
        </div>

        <div class="mt-3 flex flex-wrap gap-2">
          <span
            v-for="genre in movie.genres"
            :key="genre.id"
            class="rounded-full bg-zinc-200/50 px-3 py-1 text-xs font-medium text-zinc-700 dark:bg-zinc-700/50 dark:text-zinc-300"
          >
            {{ genre.name }}
          </span>
        </div>

        <p class="mt-6 leading-relaxed text-zinc-700 dark:text-zinc-300">{{ movie.overview }}</p>

        <div v-if="movie.imdbId" class="mt-4 text-sm text-zinc-500 dark:text-zinc-400">IMDB: {{ movie.imdbId }}</div>
      </div>
    </div>

    <div class="mt-10">
      <h2 class="mb-4 text-xl font-bold text-zinc-900 dark:text-white">
        <UIcon name="i-lucide-download" class="mr-2 inline size-5" />
        {{ t('movie.availableTorrents') }}
      </h2>

      <div
        v-if="torrents.length === 0"
        class="rounded-xl bg-zinc-100/50 py-8 text-center text-zinc-500 dark:bg-zinc-800/50 dark:text-zinc-400"
      >
        <p v-if="!movie.imdbId">{{ t('movie.noImdb') }}</p>
        <p v-else>{{ t('movie.noTorrents') }}</p>
      </div>

      <div v-else class="space-y-2">
        <div
          v-for="(torrent, idx) in torrents"
          :key="idx"
          class="flex flex-col gap-3 rounded-xl border p-4 transition-all sm:flex-row sm:items-center sm:justify-between"
          :class="
            torrent.recommended
              ? 'border-amber-500/50 bg-amber-500/5 shadow-md shadow-amber-500/10'
              : 'border-zinc-200 bg-white/50 dark:border-zinc-700 dark:bg-zinc-800/50'
          "
        >
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2">
              <span v-if="torrent.recommended" class="flex items-center gap-1 text-xs font-bold text-amber-500">
                <UIcon name="i-lucide-star" class="size-3" />
                {{ t('movie.recommended') }}
              </span>
              <span
                v-if="torrent.resolution"
                class="rounded px-1.5 py-0.5 text-xs font-bold"
                :class="
                  torrent.resolution === '1080p'
                    ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400'
                    : torrent.resolution === '4k' || torrent.resolution === '2160p'
                      ? 'bg-blue-500/20 text-blue-600 dark:text-blue-400'
                      : 'bg-zinc-500/20 text-zinc-600 dark:text-zinc-400'
                "
              >
                {{ torrent.resolution?.toUpperCase() }}
              </span>
              <span
                v-if="torrent.language"
                class="rounded bg-zinc-200/50 px-1.5 py-0.5 text-xs text-zinc-600 dark:bg-zinc-700/50 dark:text-zinc-400"
              >
                {{ formatLanguage(torrent.language) }}
              </span>
            </div>
            <p class="mt-1 line-clamp-1 text-sm text-zinc-800 dark:text-zinc-200">{{ torrent.title }}</p>
            <div class="mt-1 flex items-center gap-3 text-xs text-zinc-500 dark:text-zinc-400">
              <span>{{ torrent.sizeFormatted }}</span>
              <span class="flex items-center gap-1 text-emerald-500">
                <UIcon name="i-lucide-arrow-up" class="size-3" />
                {{ torrent.seeders }}
              </span>
              <span class="flex items-center gap-1 text-red-500">
                <UIcon name="i-lucide-arrow-down" class="size-3" />
                {{ torrent.leechers }}
              </span>
              <span>{{ torrent.indexer }}</span>
            </div>
          </div>

          <div class="flex items-center gap-3">
            <div class="text-right">
              <div
                class="text-lg font-bold"
                :class="
                  torrent.score >= 80 ? 'text-emerald-500' : torrent.score >= 60 ? 'text-amber-500' : 'text-zinc-500'
                "
              >
                {{ torrent.score }}
              </div>
              <div class="text-[10px] text-zinc-400">/100</div>
            </div>
            <UButton
              color="warning"
              icon="i-lucide-download"
              :loading="downloadingIdx === idx"
              @click="downloadTorrent(torrent, idx)"
            >
              {{ t('movie.download') }}
            </UButton>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
interface Torrent {
  title: string
  size: number
  sizeFormatted: string
  seeders: number
  leechers: number
  indexer: string
  magnetLink: string | null
  score: number
  recommended: boolean
  resolution: string | null
  source: string | null
  language: string | null
}

interface MovieData {
  id: number
  title: string
  originalTitle: string
  overview: string
  posterUrl: string | null
  backdropUrl: string | null
  releaseDate: string
  rating: number
  voteCount: number
  runtime: number | null
  genres: Array<{ id: number; name: string }>
  imdbId: string | null
}

const route = useRoute()
const downloadingIdx = ref<number | null>(null)
const { t, locale } = useI18n()

const { data, pending, error } = await useFetch<{ movie: MovieData; torrents: Torrent[] }>(
  computed(() => `/api/browse/movie/${route.params.id}?locale=${locale.value}`),
  { watch: [locale] }
)

const movie = computed(() => data.value?.movie ?? null)
const torrents = computed(() => data.value?.torrents ?? [])

function formatLanguage(lang: string): string {
  const map: Record<string, string> = {
    'pl-dub': 'PL Dubbing',
    'pl-sub': 'PL Napisy',
    'pl-lektor': 'PL Lektor',
    en: 'English'
  }
  return map[lang] ?? lang
}

async function downloadTorrent(torrent: Torrent, idx: number) {
  if (torrent.magnetLink === null) return
  downloadingIdx.value = idx

  try {
    await $fetch('/api/browse/download', {
      method: 'POST',
      body: {
        magnetLink: torrent.magnetLink,
        label: movie.value?.title ?? 'Film',
        savePath: 'movies'
      }
    })
    const toast = useToast()
    toast.add({
      title: t('download.added'),
      description: t('download.addedDesc', { label: movie.value?.title ?? 'Film' }),
      color: 'success'
    })
    navigateTo('/dashboard/downloads')
  } catch (err) {
    const toast = useToast()
    const msg = err instanceof Error ? err.message : t('download.errorDesc')
    toast.add({ title: t('download.error'), description: msg, color: 'error' })
  } finally {
    downloadingIdx.value = null
  }
}
</script>
