<script setup lang="ts">
import type { Download } from '~/types/downloads'
import {
  formatSpeed,
  formatSize,
  formatDate,
  getTorrentQuality,
  useQualityConfig,
  useEtaLabel
} from '~/composables/useTorrentUtils'

definePageMeta({
  middleware: 'auth',
  layout: 'default'
})

const { t, locale } = useI18n()
const { smallerThan } = useBreakpoints()
const { user } = useUserSession()
const { data: me } = useFetch('/api/user/me')
const { confirm } = useConfirmDialog()
const toast = useToast()

const canSubmit = computed(() => me.value?.canSubmit === true || user.value?.role === 'admin')

const downloads = ref<Download[]>([])
const loading = ref(true)
const cancelling = ref<string | null>(null)
const page = ref(1)
const total = ref(0)
const PAGE_SIZE = 10
const prepSpeedMb = ref(15)

async function fetchPrepConfig() {
  try {
    const data = await $fetch<{ enabled: boolean; speedMb: number }>('/api/prep-config')
    prepSpeedMb.value = data.speedMb
  } catch {
    // keep default
  }
}

let fetchInFlight = false
let lastFetchOk = true

async function fetchDownloads() {
  // Skip polls while one is in flight so a slow page-1 response cannot clobber page 2
  if (fetchInFlight) return
  fetchInFlight = true
  try {
    const res = await $fetch<{ downloads: Download[]; total: number }>('/api/torrents/list', {
      query: { page: page.value, limit: PAGE_SIZE }
    })
    downloads.value = res.downloads
    total.value = res.total
    // Clamp after deletes shrink the list, otherwise the page can point past the last page
    const totalPages = Math.max(1, Math.ceil(res.total / PAGE_SIZE))
    if (page.value > totalPages) page.value = totalPages
    lastFetchOk = true
  } catch {
    // Toast only on the first failure so the 3s poll does not spam while the API is down
    if (lastFetchOk) {
      toast.add({ title: t('download.error'), color: 'error' })
    }
    lastFetchOk = false
  } finally {
    fetchInFlight = false
    loading.value = false
  }
}

watch(page, () => fetchDownloads())

onMounted(() => {
  void fetchPrepConfig()
  void fetchDownloads()
})

const intervalId = ref<ReturnType<typeof setInterval>>()
onMounted(() => {
  intervalId.value = setInterval(() => {
    void fetchDownloads()
  }, 3000)
})
onUnmounted(() => {
  if (intervalId.value) clearInterval(intervalId.value)
})

async function cancelTorrent(dl: Download) {
  const confirmed = await confirm({
    title: t('download.confirmTitle'),
    description: t('download.confirmDelete'),
    confirmLabel: t('download.delete'),
    cancelLabel: t('common.cancel')
  })
  if (!confirmed) return

  cancelling.value = dl.id
  try {
    await $fetch(`/api/torrents/${dl.id}`, { method: 'DELETE' })
    await fetchDownloads()
  } catch {
    toast.add({ title: t('download.error'), color: 'error' })
  } finally {
    cancelling.value = null
  }
}

function getDisplayName(dl: Download): string {
  return dl.label || dl.torrentName || dl.magnetLink.substring(0, 80) + '...'
}

const { qualityConfig } = useQualityConfig()
const etaLabel = useEtaLabel()

function formatPrepTime(completedAt: string | null, sizeBytes: number): string {
  if (completedAt === null || completedAt === '') return ''
  const prepSpeedBytes = prepSpeedMb.value * 1024 * 1024
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
  disk_full: 'bg-orange-500/15 text-orange-700 dark:text-orange-400',
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
    <div v-reveal class="mb-8">
      <h1 class="text-3xl font-bold text-zinc-900 dark:text-white mb-2">{{ t('dashboard.myDownloads') }}</h1>
      <p class="text-zinc-500 dark:text-zinc-400">{{ t('dashboard.trackManage') }}</p>
    </div>

    <div v-if="loading && downloads.length === 0" class="space-y-3">
      <div
        v-for="i in 4"
        :key="i"
        class="flex gap-3 p-3 rounded-xl border border-zinc-200 dark:border-white/5 bg-zinc-50 dark:bg-white/2 sm:gap-4 sm:p-5"
      >
        <USkeleton class="shrink-0 w-12 h-18 rounded-lg sm:w-20 sm:h-30" />
        <div class="flex-1 space-y-2 py-1">
          <USkeleton class="h-4 w-3/4 rounded" />
          <USkeleton class="h-3 w-1/2 rounded" />
          <USkeleton class="h-2 w-full rounded-full mt-3" />
        </div>
      </div>
    </div>

    <div v-else-if="downloads.length === 0" v-reveal class="card p-12 text-center">
      <UIcon name="i-lucide-inbox" class="w-16 h-16 mx-auto mb-4 text-zinc-300 dark:text-zinc-600" />
      <p class="text-zinc-500 dark:text-zinc-400 text-lg">{{ t('dashboard.noDownloads') }}</p>
      <UButton v-if="canSubmit" to="/dashboard/submit" :label="t('dashboard.noDownloadsDesc')" class="mt-4" />
    </div>

    <div v-else class="space-y-3">
      <div
        v-for="dl in downloads"
        :key="dl.id"
        v-reveal
        class="flex gap-3 p-3 rounded-xl border transition-all bg-zinc-50 dark:bg-white/2 sm:gap-4 sm:p-5"
        :class="
          dl.status === 'downloading' && getTorrentQuality(dl) !== 'ok'
            ? qualityConfig[getTorrentQuality(dl)].border
            : 'border-zinc-200 dark:border-white/5'
        "
      >
        <div
          class="shrink-0 w-12 h-18 rounded-lg overflow-hidden bg-zinc-200 dark:bg-white/5 shadow-sm dark:shadow-black/20 sm:w-20 sm:h-30"
        >
          <img
            v-if="dl.posterUrl"
            :src="dl.posterUrl"
            :alt="dl.label"
            width="48"
            height="72"
            class="w-full h-full object-cover"
            loading="lazy"
          />
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
                  v-if="dl.resolution || dl.indexerName"
                  class="text-xs px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-white/5 text-zinc-600 dark:text-zinc-400"
                >
                  {{ [dl.resolution, dl.indexerName].filter(Boolean).join(' · ') }}
                </span>
                <span
                  v-if="getTorrentQuality(dl) !== 'ok' && dl.status === 'downloading'"
                  class="text-xs px-2 py-0.5 rounded-full"
                  :class="qualityConfig[getTorrentQuality(dl)].badge"
                >
                  {{ qualityConfig[getTorrentQuality(dl)].badgeText }}
                </span>
                <span class="text-xs text-zinc-400 dark:text-zinc-500">
                  {{ formatDate(dl.createdAt, locale) }}
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
                  <span class="text-zinc-900 dark:text-white font-medium">{{ etaLabel(dl) }}</span></span
                >
              </div>
            </div>
            <div class="w-full h-2 rounded-full bg-zinc-200 dark:bg-white/10">
              <div
                class="h-full min-w-0.5 rounded-full bg-linear-to-r transition-[width] duration-1000 ease-linear"
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
            :class="
              dl.notifiedAt === null ? 'text-amber-600 dark:text-amber-400' : 'text-green-600 dark:text-green-400'
            "
          >
            <UIcon :name="dl.notifiedAt === null ? 'i-lucide-clock' : 'i-lucide-check-circle'" class="w-4 h-4" />
            <span v-if="dl.notifiedAt === null">{{ formatPrepTime(dl.completedAt, dl.sizeBytes) }}</span>
            <span v-else>{{ t('dashboard.completed') }}</span>
            <span class="text-zinc-400 dark:text-zinc-500">· {{ formatSize(dl.sizeBytes) }}</span>
          </div>
        </div>
      </div>
    </div>

    <div v-if="total > PAGE_SIZE" class="overflow-x-auto max-w-full flex justify-center mt-6 px-2 sm:px-4">
      <UPagination
        v-model:page="page"
        :total="total"
        :items-per-page="PAGE_SIZE"
        :sibling-count="smallerThan('sm') ? 0 : 1"
        :show-edges="!smallerThan('sm')"
      />
    </div>
  </div>
</template>
