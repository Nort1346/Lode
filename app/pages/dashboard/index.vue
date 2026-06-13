<script setup lang="ts">
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
  createdAt: string
  completedAt: string | null
}

definePageMeta({
  middleware: 'auth'
})

const { user } = useUserSession()

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
    const [, downloadsRes] = await Promise.all([
      $fetch<{ downloads: Download[] }>('/api/torrents/list?status=downloading'),
      $fetch<{ downloads: Download[] }>('/api/torrents/list')
    ])

    stats.value.activeTorrents = activeDownloads.value.length
    recentDownloads.value = downloadsRes.downloads?.slice(0, 5) || []

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

async function cancelTorrent(id: string) {
  cancelling.value = id
  try {
    await $fetch(`/api/torrents/${id}`, { method: 'DELETE' })
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
  if (seconds <= 0) return '—'
  const hours = Math.floor(seconds / 3600)
  const mins = Math.floor((seconds % 3600) / 60)
  if (hours > 0) return `${hours}h ${mins}m`
  return `${mins}m`
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

const statusColors: Record<string, string> = {
  downloading: 'bg-cyan-500/15 text-cyan-700 dark:text-cyan-400',
  completed: 'bg-green-500/15 text-green-700 dark:text-green-400',
  pending: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
  failed: 'bg-red-500/15 text-red-700 dark:text-red-400',
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
    <div class="mb-8">
      <h1 class="text-3xl font-bold text-zinc-900 dark:text-white mb-2">Dashboard</h1>
      <p class="text-zinc-500 dark:text-zinc-400">
        Welcome back, <span class="text-amber-600 dark:text-amber-400 font-medium">{{ user?.username }}</span>
      </p>
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
            <p class="text-sm text-zinc-500 dark:text-zinc-400">Active Torrents</p>
          </div>
        </div>
        <div class="mt-3 text-xs text-zinc-400 dark:text-zinc-500">Limit: {{ user?.activeTorrentLimit }}</div>
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
            <p class="text-sm text-zinc-500 dark:text-zinc-400">Downloads Today</p>
          </div>
        </div>
        <div class="mt-3 text-xs text-zinc-400 dark:text-zinc-500">Limit: {{ user?.dailyDownloadLimit }}</div>
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
            <p class="text-sm text-zinc-500 dark:text-zinc-400">Completed</p>
          </div>
        </div>
        <div class="mt-3 text-xs text-zinc-400 dark:text-zinc-500">Max size: {{ user?.maxTorrentSizeGb }}GB</div>
      </div>
    </div>

    <div class="card p-5 md:p-6">
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-lg font-semibold text-zinc-900 dark:text-white">Active Downloads</h2>
        <UButton to="/dashboard/submit" icon="i-lucide-plus" label="New Request" size="sm" />
      </div>

      <div v-if="loading && activeDownloads.length === 0" class="flex justify-center py-8">
        <UIcon name="i-lucide-loader-2" class="w-8 h-8 text-amber-500 dark:text-amber-400 animate-spin" />
      </div>

      <div v-else-if="activeDownloads.length === 0" class="text-center py-8 text-zinc-500 dark:text-zinc-400">
        <UIcon name="i-lucide-inbox" class="w-12 h-12 mx-auto mb-3 opacity-40" />
        <p>No active downloads. Submit a torrent to get started!</p>
      </div>

      <div v-else class="space-y-3">
        <div
          v-for="dl in activeDownloads"
          :key="dl.id"
          class="p-4 rounded-xl border border-zinc-200 dark:border-white/5 hover:border-zinc-300 dark:hover:border-white/10 transition-all bg-zinc-50 dark:bg-white/2"
        >
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
                  {{ dl.status }}
                </span>
              </div>
            </div>
            <UButton
              icon="i-lucide-trash-2"
              color="error"
              variant="ghost"
              size="xs"
              :loading="cancelling === dl.id"
              label="Delete"
              @click="cancelTorrent(dl.id)"
            />
          </div>

          <div class="space-y-2">
            <div class="flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400">
              <span class="font-medium text-zinc-900 dark:text-white">{{ dl.progress.toFixed(1) }}%</span>
              <span
                >ETA: <span class="text-zinc-900 dark:text-white">{{ formatEta(dl.etaSeconds) }}</span></span
              >
            </div>
            <div class="w-full h-2 rounded-full bg-zinc-200 dark:bg-white/10">
              <div class="progress-bar h-full min-w-0.5" :style="{ width: `${Math.max(dl.progress, 0.5)}%` }" />
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
</template>
