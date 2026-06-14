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
  middleware: 'auth',
  layout: 'default'
})

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

async function cancelTorrent(id: string) {
  cancelling.value = id
  try {
    await $fetch(`/api/torrents/${id}`, { method: 'DELETE' })
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

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString()
}

function formatPrepTime(completedAt: string | null, sizeBytes: number): string {
  if (!completedAt) return ''
  const prepSpeedBytes = 8 * 1024 * 1024
  const elapsed = (Date.now() - new Date(completedAt).getTime()) / 1000
  const delay = sizeBytes / prepSpeedBytes
  const remaining = Math.max(0, delay - elapsed)
  if (remaining <= 0) return 'Ready'
  if (remaining < 60) return `~${Math.ceil(remaining)}s remaining`
  return `~${Math.ceil(remaining / 60)}m remaining`
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
      <h1 class="text-3xl font-bold text-zinc-900 dark:text-white mb-2">My Downloads</h1>
      <p class="text-zinc-500 dark:text-zinc-400">Track and manage your torrents</p>
    </div>

    <div v-if="loading && downloads.length === 0" class="flex justify-center py-16">
      <UIcon name="i-lucide-loader-2" class="w-8 h-8 text-amber-500 dark:text-amber-400 animate-spin" />
    </div>

    <div v-else-if="downloads.length === 0" class="card p-12 text-center">
      <UIcon name="i-lucide-inbox" class="w-16 h-16 mx-auto mb-4 text-zinc-300 dark:text-zinc-600" />
      <p class="text-zinc-500 dark:text-zinc-400 text-lg">No downloads yet</p>
      <UButton to="/dashboard/submit" label="Submit your first torrent" class="mt-4" />
    </div>

    <div v-else class="space-y-3">
      <div v-for="dl in downloads" :key="dl.id" class="card p-5">
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
                {{ capitalize(dl.status) }}
              </span>
              <span
                class="text-xs px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-white/5 text-zinc-600 dark:text-zinc-400"
              >
                {{ savePathLabels[dl.savePath] }}
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
            variant="ghost"
            size="xs"
            label="Delete"
            :loading="cancelling === dl.id"
            @click="cancelTorrent(dl.id)"
          />
        </div>

        <div v-if="dl.status === 'downloading'" class="space-y-2">
          <div class="flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400">
            <span class="font-medium text-zinc-900 dark:text-white">{{ dl.progress.toFixed(1) }}%</span>
            <span
              >ETA: <span class="text-zinc-900 dark:text-white font-medium">{{ formatEta(dl.etaSeconds) }}</span></span
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

        <div
          v-else-if="dl.status === 'completed'"
          class="flex items-center gap-2 text-sm"
          :class="dl.completedAt ? 'text-amber-600 dark:text-amber-400' : 'text-green-600 dark:text-green-400'"
        >
          <UIcon :name="dl.completedAt ? 'i-lucide-clock' : 'i-lucide-check-circle'" class="w-4 h-4" />
          <span v-if="dl.completedAt">{{ formatPrepTime(dl.completedAt, dl.sizeBytes) }}</span>
          <span v-else>Download completed</span>
          <span class="text-zinc-400 dark:text-zinc-500">· {{ formatSize(dl.sizeBytes) }}</span>
        </div>
      </div>
    </div>
  </div>
</template>
