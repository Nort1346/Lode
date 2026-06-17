<script setup lang="ts">
import ConfirmDialog from '~/components/ConfirmDialog.vue'

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
  middleware: 'auth',
  layout: 'default'
})

const { t } = useI18n()
const overlay = useOverlay()

const downloads = ref<Download[]>([])
const loading = ref(true)
const cancelling = ref<string | null>(null)

async function fetchDownloads() {
  loading.value = true
  try {
    const res = await $fetch<{ downloads: Download[] }>('/api/torrents/list')
    downloads.value = res.downloads || []
  } catch {
    // silently fail
  } finally {
    loading.value = false
  }
}

onMounted(fetchDownloads)

const intervalId = ref<ReturnType<typeof setInterval>>()
onMounted(() => {
  intervalId.value = setInterval(fetchDownloads, 3000)
})
onUnmounted(() => {
  if (intervalId.value) clearInterval(intervalId.value)
})

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
    await fetchDownloads()
  } catch {
    // silently fail
  } finally {
    cancelling.value = null
  }
}

function getDisplayName(dl: Download): string {
  return dl.label || dl.torrentName || dl.magnetLink.substring(0, 80) + '...'
}

function formatEta(seconds: number): string {
  if (seconds <= 0) return '—'
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
  if (bytes <= 0) return '—'
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

const qualityConfig = computed(
  (): Record<TorrentQuality, { border: string; badge: string; badgeKey: string; bar: string }> => ({
    dead: {
      border: 'border-red-500/60 dark:border-red-500/40',
      badge: 'bg-red-500/15 text-red-700 dark:text-red-400',
      badgeKey: 'torrent.dead',
      bar: 'from-red-500 to-red-600'
    },
    poor: {
      border: 'border-amber-500/50 dark:border-amber-500/30',
      badge: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
      badgeKey: 'torrent.poor',
      bar: 'from-amber-500 to-orange-500'
    },
    slow: {
      border: 'border-zinc-400/50 dark:border-zinc-500/30',
      badge: 'bg-zinc-500/15 text-zinc-600 dark:text-zinc-400',
      badgeKey: 'torrent.slow',
      bar: 'from-cyan-500 to-blue-500'
    },
    ok: {
      border: '',
      badge: '',
      badgeKey: '',
      bar: 'from-cyan-500 to-blue-500'
    }
  })
)

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString()
}

function formatPrepTime(completedAt: string | null, sizeBytes: number): string {
  if (!completedAt) return ''
  const prepSpeedBytes = 8 * 1024 * 1024
  const elapsed = (Date.now() - new Date(completedAt).getTime()) / 1000
  const delay = sizeBytes / prepSpeedBytes
  const remaining = Math.max(0, delay - elapsed)
  if (remaining <= 0) return t('downloads.prepReady')
  if (remaining < 60) return t('downloads.prepRemainingSec', { s: Math.ceil(remaining) })
  return t('downloads.prepRemainingMin', { m: Math.ceil(remaining / 60) })
}

const statusColors: Record<string, string> = {
  downloading: 'bg-cyan-500/15 text-cyan-700 dark:text-cyan-400',
  completed: 'bg-green-500/15 text-green-700 dark:text-green-400',
  pending: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
  failed: 'bg-red-500/15 text-red-700 dark:text-red-400',
  paused: 'bg-zinc-500/15 text-zinc-600 dark:text-zinc-400',
  removed: 'bg-zinc-500/15 text-zinc-500 dark:text-zinc-500'
}

const savePathLabels = computed<Record<string, string>>(() => ({
  movies: t('common.savePath_movies'),
  series: t('common.savePath_series'),
  games: t('common.savePath_games'),
  music: t('common.savePath_music'),
  books: t('common.savePath_books')
}))
</script>

<template>
  <div>
    <div class="mb-8">
      <h1 class="text-3xl font-bold text-zinc-900 dark:text-white mb-2">{{ t('dashboard.myDownloads') }}</h1>
      <p class="text-zinc-500 dark:text-zinc-400">{{ t('dashboard.trackManage') }}</p>
    </div>

    <div v-if="loading && downloads.length === 0" class="flex justify-center py-16">
      <UIcon name="i-lucide-loader-2" class="w-8 h-8 text-amber-500 dark:text-amber-400 animate-spin" />
    </div>

    <div v-else-if="downloads.length === 0" class="card p-12 text-center">
      <UIcon name="i-lucide-inbox" class="w-16 h-16 mx-auto mb-4 text-zinc-300 dark:text-zinc-600" />
      <p class="text-zinc-500 dark:text-zinc-400 text-lg">{{ t('dashboard.noDownloads') }}</p>
      <UButton to="/dashboard/submit" :label="t('dashboard.noDownloadsDesc')" class="mt-4" />
    </div>

    <div v-else class="space-y-3">
      <div
        v-for="dl in downloads"
        :key="dl.id"
        class="flex gap-3 p-3 rounded-xl border transition-all bg-zinc-50 dark:bg-white/2 sm:gap-4 sm:p-5"
        :class="
          getTorrentQuality(dl) !== 'ok'
            ? qualityConfig[getTorrentQuality(dl)].border
            : 'border-zinc-200 dark:border-white/5'
        "
      >
        <div
          class="shrink-0 w-12 h-[72px] rounded-lg overflow-hidden bg-zinc-200 dark:bg-white/5 shadow-sm dark:shadow-black/20 sm:w-[80px] sm:h-[120px]"
        >
          <img v-if="dl.posterUrl" :src="dl.posterUrl" class="w-full h-full object-cover" loading="lazy" />
          <div v-else class="flex items-center justify-center w-full h-full">
            <UIcon name="i-lucide-film" class="w-5 h-5 text-zinc-300 dark:text-zinc-600 sm:w-8 sm:h-8" />
          </div>
        </div>

        <div class="flex-1 min-w-0">
          <div class="flex items-start justify-between mb-3">
            <div class="flex-1 min-w-0">
              <p class="font-medium text-zinc-900 dark:text-white truncate">
                {{ getDisplayName(dl) }}
              </p>
              <div class="flex items-center gap-2 mt-1.5 flex-wrap">
                <span
                  v-if="dl.username"
                  class="text-xs px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-white/10 text-zinc-600 dark:text-zinc-400"
                >
                  @{{ dl.username }}
                </span>
                <span class="text-xs px-2 py-0.5 rounded-full" :class="statusColors[dl.status]">
                  {{ t(`common.status_${dl.status}`) }}
                </span>
                <span
                  class="text-xs px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-white/5 text-zinc-600 dark:text-zinc-400"
                >
                  {{ savePathLabels[dl.savePath] }}
                </span>
                <span
                  v-if="getTorrentQuality(dl) !== 'ok' && dl.status === 'downloading'"
                  class="text-xs px-2 py-0.5 rounded-full"
                  :class="qualityConfig[getTorrentQuality(dl)].badge"
                >
                  {{
                    qualityConfig[getTorrentQuality(dl)].badgeKey
                      ? t(qualityConfig[getTorrentQuality(dl)].badgeKey)
                      : ''
                  }}
                </span>
                <span class="text-xs text-zinc-400 dark:text-zinc-500">
                  {{ formatDate(dl.createdAt) }}
                </span>
              </div>
            </div>

            <UButton
              v-if="dl.status === 'downloading' || dl.status === 'pending'"
              icon="i-lucide-trash-2"
              color="error"
              :variant="getTorrentQuality(dl) !== 'ok' ? 'solid' : 'ghost'"
              size="xs"
              :label="getTorrentQuality(dl) !== 'ok' ? t('common.deleteBad') : t('common.delete')"
              :loading="cancelling === dl.id"
              class="hidden sm:inline-flex"
              @click="cancelTorrent(dl)"
            />
            <UButton
              v-if="dl.status === 'downloading' || dl.status === 'pending'"
              icon="i-lucide-trash-2"
              color="error"
              :variant="getTorrentQuality(dl) !== 'ok' ? 'solid' : 'ghost'"
              size="xs"
              :loading="cancelling === dl.id"
              class="sm:hidden"
              @click="cancelTorrent(dl)"
            />
          </div>

          <div v-if="dl.status === 'downloading'" class="space-y-2">
            <div class="flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400">
              <span class="font-medium text-zinc-900 dark:text-white">{{ dl.progress.toFixed(1) }}%</span>
              <div class="flex items-center gap-3">
                <span v-if="dl.numSeeds > 0" class="text-zinc-500 dark:text-zinc-400">
                  <UIcon name="i-lucide-arrow-up" class="inline size-3" />{{ dl.numSeeds }}
                </span>
                <span v-if="dl.numLeechs > 0" class="text-zinc-400 dark:text-zinc-500">
                  <UIcon name="i-lucide-arrow-down" class="inline size-3" />{{ dl.numLeechs }}
                </span>
                <span
                  >{{ t('common.eta') }}:
                  <span class="text-zinc-900 dark:text-white font-medium">{{ formatEta(dl.etaSeconds) }}</span></span
                >
              </div>
            </div>
            <div class="w-full h-2 rounded-full bg-zinc-200 dark:bg-white/10">
              <div
                class="h-full min-w-0.5 rounded-full bg-gradient-to-r"
                :class="qualityConfig[getTorrentQuality(dl)].bar"
                :style="{ width: `${Math.max(dl.progress, 0.5)}%` }"
              />
            </div>
            <div class="flex items-center justify-between text-xs text-zinc-400 dark:text-zinc-500">
              <span>↓ {{ formatSpeed(dl.downloadSpeed) }} · ↑ {{ formatSpeed(dl.uploadSpeed) }}</span>
              <span>{{ formatSize(dl.downloadedBytes) }} / {{ formatSize(dl.sizeBytes) }}</span>
            </div>
          </div>

          <div
            v-else-if="dl.status === 'completed'"
            class="flex items-center gap-2 text-sm"
            :class="dl.completedAt ? 'text-amber-600 dark:text-amber-400' : 'text-green-600 dark:text-green-400'"
          >
            <UIcon :name="dl.completedAt ? 'i-lucide-clock' : 'i-lucide-check-circle'" class="w-4 h-4" />
            <span v-if="dl.completedAt">{{ formatPrepTime(dl.completedAt, dl.sizeBytes) }}</span>
            <span v-else>{{ t('dashboard.completed') }}</span>
            <span class="text-zinc-400 dark:text-zinc-500">· {{ formatSize(dl.sizeBytes) }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
