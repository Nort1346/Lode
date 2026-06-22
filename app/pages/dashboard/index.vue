<script setup lang="ts">
import ConfirmDialog from '~/components/ConfirmDialog.vue'
import type { MediaCarouselItem } from '~/components/MediaCarousel.vue'

interface Download {
  id: string
  userId: string
  username?: string
  label: string
  torrentName: string
  magnetLink: string
  savePath: string
  status: string
  torrentHash: string | null
  progress: number
  etaSeconds: number
  downloadSpeed: number
  uploadSpeed: number
  sizeBytes: number
  downloadedBytes: number
  numSeeds: number
  numLeechs: number
  createdAt: string
  completedAt: string | null
  posterUrl: string | null
}

definePageMeta({
  middleware: 'auth'
})

const { user } = useUserSession()
const { t, locale } = useI18n()
const overlay = useOverlay()

const stats = ref({
  activeTorrents: 0,
  downloadsToday: 0,
  completedToday: 0
})

const recentDownloads = ref<Download[]>([])
const activeDownloads = computed(() => recentDownloads.value.filter((d) => d.status === 'downloading'))
const loading = ref(true)
const cancelling = ref<string | null>(null)

async function fetchData() {
  try {
    const downloadsRes = await $fetch<{ downloads: Download[] }>('/api/torrents/list')

    recentDownloads.value = downloadsRes.downloads || []
    stats.value.activeTorrents = recentDownloads.value.filter((d: Download) => d.status === 'downloading').length

    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)
    stats.value.completedToday = recentDownloads.value.filter(
      (d: Download) => d.status === 'completed' && new Date(d.createdAt) >= todayStart
    ).length
    stats.value.downloadsToday = stats.value.completedToday
  } catch {
    // silently fail
  } finally {
    loading.value = false
  }
}

onMounted(fetchData)

const intervalId = ref<ReturnType<typeof setInterval>>()
onMounted(() => {
  intervalId.value = setInterval(fetchData, 3000)
})
onUnmounted(() => {
  if (intervalId.value) clearInterval(intervalId.value)
})

const { data: trendingData } = useLazyFetch('/api/browse/trending', {
  query: computed(() => ({ locale: locale.value }))
})
const trendingItems = computed<MediaCarouselItem[]>(() => trendingData.value?.items ?? [])

const { data: popularData } = useLazyFetch('/api/browse/popular', {
  query: computed(() => ({ locale: locale.value }))
})
const popularMovies = computed(
  () =>
    (popularData.value?.movies ?? []).map((m: Record<string, unknown>) => ({
      ...m,
      type: 'movie' as const,
      logoUrl: null
    })) as MediaCarouselItem[]
)
const popularTvShows = computed(
  () =>
    (popularData.value?.tv ?? []).map((m: Record<string, unknown>) => ({
      ...m,
      type: 'tv' as const,
      logoUrl: null
    })) as MediaCarouselItem[]
)

function goToItem(item: { id: number; type: string }) {
  if (item.type === 'movie') {
    navigateTo(`/browse/movie/${item.id}`)
  } else {
    navigateTo(`/browse/tv/${item.id}`)
  }
}

async function cancelTorrent(dl: Download) {
  const modal = overlay.create(ConfirmDialog, {
    props: {
      title: t('download.confirmTitle'),
      description: t('download.confirmDelete'),
      confirmLabel: t('download.delete'),
      cancelLabel: t('common.cancel')
    }
  })
  const confirmed = await modal.open()
  if (!confirmed) return

  cancelling.value = dl.id
  try {
    await $fetch(`/api/torrents/${dl.id}`, { method: 'DELETE' })
    await fetchData()
  } catch {
    // silently fail
  } finally {
    cancelling.value = null
  }
}

function getDisplayName(dl: Download): string {
  return dl.label || dl.torrentName || dl.magnetLink.substring(0, 60) + '...'
}

function formatEta(seconds: number): string {
  if (seconds <= 0) return '-'
  const hours = Math.floor(seconds / 3600)
  const mins = Math.floor((seconds % 3600) / 60)
  const secs = Math.floor(seconds % 60)
  if (hours > 0) return `${hours}h ${mins}m`
  if (mins > 0) return `${mins}m ${secs}s`
  return `${secs}s`
}

function formatSpeed(bytes: number): string {
  if (bytes <= 0) return '0 B/s'
  const kb = bytes / 1024
  if (kb < 1024) return `${kb.toFixed(1)} KB/s`
  const mb = kb / 1024
  return `${mb.toFixed(1)} MB/s`
}

function formatSize(bytes: number): string {
  if (bytes <= 0) return '-'
  const gb = bytes / (1024 * 1024 * 1024)
  if (gb >= 1) return `${gb.toFixed(2)} GB`
  const mb = bytes / (1024 * 1024)
  return `${mb.toFixed(1)} MB`
}

type TorrentQuality = 'dead' | 'poor' | 'slow' | 'ok'

function getTorrentQuality(dl: Download): TorrentQuality {
  if (dl.status !== 'downloading') return 'ok'
  if (dl.numSeeds === 0 && dl.progress < 100) return 'dead'
  if (dl.numSeeds <= 3 && dl.progress < 100) return 'poor'
  if (dl.downloadSpeed === 0 && dl.etaSeconds > 0 && dl.progress < 100) return 'slow'
  return 'ok'
}

const qualityConfig = computed<
  Record<TorrentQuality, { border: string; badge: string; badgeText: string; bar: string }>
>(() => ({
  dead: {
    border: 'border-red-500/60 dark:border-red-500/40',
    badge: 'bg-red-500/15 text-red-700 dark:text-red-400',
    badgeText: t('torrent.dead'),
    bar: 'from-red-500 to-red-600'
  },
  poor: {
    border: 'border-amber-500/50 dark:border-amber-500/30',
    badge: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
    badgeText: t('torrent.poor'),
    bar: 'from-amber-500 to-orange-500'
  },
  slow: {
    border: 'border-zinc-400/50 dark:border-zinc-500/30',
    badge: 'bg-zinc-500/15 text-zinc-600 dark:text-zinc-400',
    badgeText: t('torrent.slow'),
    bar: 'from-cyan-500 to-blue-500'
  },
  ok: {
    border: 'border-zinc-200 dark:border-white/5',
    badge: '',
    badgeText: '',
    bar: 'from-cyan-500 to-blue-500'
  }
}))

const statusColors: Record<string, string> = {
  downloading: 'bg-cyan-500/15 text-cyan-700 dark:text-cyan-400',
  completed: 'bg-green-500/15 text-green-700 dark:text-green-400',
  pending: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
  failed: 'bg-red-500/15 text-red-700 dark:text-red-400',
  disk_full: 'bg-orange-500/15 text-orange-700 dark:text-orange-400',
  paused: 'bg-zinc-500/15 text-zinc-600 dark:text-zinc-400',
  removed: 'bg-zinc-500/15 text-zinc-500 dark:text-zinc-500'
}

const savePathLabels: Record<string, string> = {
  movies: '🎬 Movies',
  series: '📺 Series',
  games: '🎮 Games',
  music: '🎵 Music',
  books: '📚 Books'
}
</script>

<template>
  <div>
    <div class="mb-6 flex items-center justify-between">
      <div>
        <h1 class="text-3xl font-bold text-zinc-900 dark:text-white mb-1">Dashboard</h1>
        <p class="text-zinc-500 dark:text-zinc-400">
          {{ t('dashboard.welcome') }}
          <span class="text-amber-600 dark:text-amber-400 font-medium">{{ user?.username }}</span>
        </p>
      </div>
    </div>

    <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
      <div class="card p-5">
        <div class="flex items-center gap-4">
          <div
            class="w-11 h-11 rounded-xl bg-amber-500/10 dark:bg-amber-500/15 flex items-center justify-center shrink-0"
          >
            <UIcon name="i-lucide-download" class="w-5 h-5 text-amber-600 dark:text-amber-400" />
          </div>
          <div>
            <p class="text-2xl font-bold text-zinc-900 dark:text-white">
              {{ stats.activeTorrents }}
            </p>
            <p class="text-sm text-zinc-500 dark:text-zinc-400">{{ t('dashboard.activeTorrents') }}</p>
          </div>
        </div>
        <div class="mt-3 text-xs text-zinc-400 dark:text-zinc-500">
          {{ t('common.limit') }}: {{ user?.activeTorrentLimit }}
        </div>
      </div>

      <div class="card p-5">
        <div class="flex items-center gap-4">
          <div
            class="w-11 h-11 rounded-xl bg-cyan-500/10 dark:bg-cyan-500/15 flex items-center justify-center shrink-0"
          >
            <UIcon name="i-lucide-clock" class="w-5 h-5 text-cyan-600 dark:text-cyan-400" />
          </div>
          <div>
            <p class="text-2xl font-bold text-zinc-900 dark:text-white">
              {{ stats.downloadsToday }}
            </p>
            <p class="text-sm text-zinc-500 dark:text-zinc-400">{{ t('dashboard.downloadsToday') }}</p>
          </div>
        </div>
        <div class="mt-3 text-xs text-zinc-400 dark:text-zinc-500">
          {{ t('common.limit') }}: {{ user?.dailyDownloadLimit }}
        </div>
      </div>

      <div class="card p-5">
        <div class="flex items-center gap-4">
          <div
            class="w-11 h-11 rounded-xl bg-green-500/10 dark:bg-green-500/15 flex items-center justify-center shrink-0"
          >
            <UIcon name="i-lucide-check-circle" class="w-5 h-5 text-green-600 dark:text-green-400" />
          </div>
          <div>
            <p class="text-2xl font-bold text-zinc-900 dark:text-white">
              {{ stats.completedToday }}
            </p>
            <p class="text-sm text-zinc-500 dark:text-zinc-400">{{ t('dashboard.completed') }}</p>
          </div>
        </div>
        <div class="mt-3 text-xs text-zinc-400 dark:text-zinc-500">Max size: {{ user?.maxTorrentSizeGb }}GB</div>
      </div>
    </div>

    <div class="card p-5 md:p-6 mb-8">
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-lg font-semibold text-zinc-900 dark:text-white">{{ t('dashboard.activeTorrents') }}</h2>
        <UButton to="/browse" icon="i-lucide-search" :label="t('dashboard.browse')" size="sm" />
      </div>

      <div v-if="loading && activeDownloads.length === 0" class="flex justify-center py-8">
        <UIcon name="i-lucide-loader-2" class="w-8 h-8 text-amber-500 dark:text-amber-400 animate-spin" />
      </div>

      <div v-else-if="activeDownloads.length === 0" class="text-center py-8 text-zinc-500 dark:text-zinc-400">
        <UIcon name="i-lucide-inbox" class="w-12 h-12 mx-auto mb-3 opacity-40" />
        <p>{{ t('dashboard.noActive') }}</p>
      </div>

      <div v-else class="space-y-3">
        <div
          v-for="dl in activeDownloads"
          :key="dl.id"
          class="flex gap-3 p-3 rounded-xl border transition-all bg-zinc-50 dark:bg-white/2 sm:gap-4 sm:p-4"
          :class="
            getTorrentQuality(dl) === 'ok'
              ? 'border-zinc-200 dark:border-white/5 hover:border-zinc-300 dark:hover:border-white/10'
              : qualityConfig[getTorrentQuality(dl)].border
          "
        >
          <div
            class="shrink-0 w-12 h-18 rounded-lg overflow-hidden bg-zinc-200 dark:bg-white/5 shadow-sm dark:shadow-black/20 sm:w-20 sm:h-30"
          >
            <img v-if="dl.posterUrl" :src="dl.posterUrl" class="w-full h-full object-cover" loading="lazy" />
            <div v-else class="flex items-center justify-center w-full h-full">
              <UIcon name="i-lucide-film" class="w-5 h-5 text-zinc-300 dark:text-zinc-600 sm:w-8 sm:h-8" />
            </div>
          </div>

          <div class="flex-1 min-w-0">
            <div class="flex items-start justify-between mb-2">
              <div class="flex-1 min-w-0">
                <p class="text-sm font-medium text-zinc-900 dark:text-white truncate">
                  {{ getDisplayName(dl) }}
                </p>
                <div class="flex items-center gap-2 mt-1.5 flex-wrap">
                  <span
                    v-if="dl.username"
                    class="text-xs px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-white/10 text-zinc-600 dark:text-zinc-400"
                  >
                    @{{ dl.username }}
                  </span>
                  <span class="text-xs px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-400">
                    {{ savePathLabels[dl.savePath] || dl.savePath }}
                  </span>
                  <span class="text-xs px-2 py-0.5 rounded-full" :class="statusColors[dl.status]">
                    {{ capitalize(dl.status) }}
                  </span>
                  <span
                    v-if="getTorrentQuality(dl) !== 'ok'"
                    class="text-xs px-2 py-0.5 rounded-full"
                    :class="qualityConfig[getTorrentQuality(dl)].badge"
                  >
                    {{ qualityConfig[getTorrentQuality(dl)].badgeText }}
                  </span>
                </div>
              </div>
              <UButton
                icon="i-lucide-trash-2"
                color="error"
                :variant="getTorrentQuality(dl) !== 'ok' ? 'solid' : 'ghost'"
                size="xs"
                :loading="cancelling === dl.id"
                :label="t('download.delete')"
                class="hidden sm:inline-flex"
                @click="cancelTorrent(dl)"
              />
              <UButton
                icon="i-lucide-trash-2"
                color="error"
                :variant="getTorrentQuality(dl) !== 'ok' ? 'solid' : 'ghost'"
                size="xs"
                :loading="cancelling === dl.id"
                class="sm:hidden"
                @click="cancelTorrent(dl)"
              />
            </div>

            <div class="space-y-2">
              <div class="flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400">
                <span class="font-medium text-zinc-900 dark:text-white">{{ dl.progress.toFixed(1) }}%</span>
                <div class="flex items-center gap-3">
                  <span v-if="dl.numSeeds > 0" class="text-zinc-500 dark:text-zinc-400">
                    <UIcon name="i-lucide-arrow-up" class="inline size-3" />{{ dl.numSeeds }}
                  </span>
                  <span
                    >ETA: <span class="text-zinc-900 dark:text-white">{{ formatEta(dl.etaSeconds) }}</span></span
                  >
                </div>
              </div>
              <div class="w-full h-2 rounded-full bg-zinc-200 dark:bg-white/10">
                <div
                  class="h-full min-w-0.5 rounded-full bg-linear-to-r"
                  :class="qualityConfig[getTorrentQuality(dl)].bar"
                  :style="{ width: `${Math.max(dl.progress, 0.5)}%` }"
                />
              </div>
              <div class="flex items-center justify-between text-xs text-zinc-400 dark:text-zinc-500">
                <span>↓ {{ formatSpeed(dl.downloadSpeed) }} · ↑ {{ formatSpeed(dl.uploadSpeed) }}</span>
                <span>{{ formatSize(dl.downloadedBytes) }} / {{ formatSize(dl.sizeBytes) }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <HeroSection :trending-items="trendingItems" />

    <RequestCarousel />

    <MediaCarousel :title="t('dashboard.trendingNow')" :items="trendingItems" @item-click="goToItem" />
    <MediaCarousel :title="t('browse.popularMovies')" :items="popularMovies" @item-click="goToItem" />
    <MediaCarousel :title="t('browse.popularTv')" :items="popularTvShows" @item-click="goToItem" />
  </div>
</template>
