<script setup lang="ts">
import type { Download } from '~/types/downloads'
import {
  formatSpeed,
  formatSize,
  formatDateTime,
  getTorrentQuality,
  useQualityConfig
} from '~/composables/useTorrentUtils'
import { useEtaTracker } from '~/composables/useEtaTracker'

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
    // Feed the ETA tracker before the next render so labels/borders are fresh
    trackPoll(res.downloads)
    // Clamp after deletes shrink the list, otherwise the page can point past the last page
    const totalPages = Math.max(1, Math.ceil(res.total / PAGE_SIZE))
    if (page.value > totalPages) page.value = totalPages
    lastFetchOk = true
  } catch (e: unknown) {
    // Toast only on the first failure so the 3s poll does not spam while the API is down
    if (lastFetchOk) {
      toast.add({ title: t('download.error'), description: describeApiError(e, t).description, color: 'error' })
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
  } catch (e: unknown) {
    toast.add({ title: t('download.error'), description: describeApiError(e, t).description, color: 'error' })
  } finally {
    cancelling.value = null
  }
}

function getDisplayName(dl: Download): string {
  return dl.label || dl.torrentName || dl.magnetLink.substring(0, 80) + '...'
}

const { qualityConfig } = useQualityConfig()
const { trackPoll, etaState, etaLabel } = useEtaTracker()

function cardBorderClass(dl: Download): string {
  if (dl.status === 'downloading' && getTorrentQuality(dl) !== 'ok') {
    return qualityConfig.value[getTorrentQuality(dl)].border
  }
  if (dl.status === 'downloading' && etaState(dl) === 'collecting') return 'border-amber-500/40'
  return 'border-zinc-200 dark:border-white/5'
}

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

const hasActivePrep = computed(() =>
  downloads.value.some((dl) => dl.status === 'completed' && dl.notifiedAt === null && dl.organizeStatus === 'pending')
)

// One bar for the whole preparation phase: the simulated countdown (which
// covers hardlink/rename, that finish instantly) plus the real bytes copied
// into the library. Whichever is further along wins, so the bar never moves
// backwards and never claims "done" while an upload is still running.
function prepPercent(dl: Download): number {
  if (dl.completedAt === null || dl.completedAt === '') return 0
  const prepSpeedBytes = prepSpeedMb.value * 1024 * 1024
  const elapsed = (Date.now() - new Date(dl.completedAt).getTime()) / 1000
  const delay = dl.sizeBytes / prepSpeedBytes
  const timePercent = delay > 0 ? Math.min(100, (elapsed / delay) * 100) : 100
  const bytePercent = dl.organizeProgress?.percent ?? 0
  return Math.round(Math.max(timePercent, bytePercent) * 10) / 10
}

function prepDetail(dl: Download): string {
  const progress = dl.organizeProgress
  if (progress) {
    return `${formatSize(progress.copiedBytes)} / ${formatSize(progress.totalBytes)} · ${formatSpeed(
      progress.speedBytesPerSecond
    )}`
  }
  return formatPrepTime(dl.completedAt, dl.sizeBytes)
}

// Preparation is the only phase that updates in byte steps, so poll faster
// while something is still being imported and idle at the download cadence.
const IDLE_POLL_MS = 3000
const PREP_POLL_MS = 1000

let intervalId: ReturnType<typeof setInterval> | undefined
function startPolling() {
  if (intervalId) clearInterval(intervalId)
  intervalId = setInterval(
    () => {
      void fetchDownloads()
    },
    hasActivePrep.value ? PREP_POLL_MS : IDLE_POLL_MS
  )
}

onMounted(startPolling)
watch(hasActivePrep, startPolling)
onUnmounted(() => {
  if (intervalId) clearInterval(intervalId)
})

const statusColors: Record<string, string> = {
  checking: 'bg-teal-500/15 text-teal-700 dark:text-teal-400',
  downloading: 'bg-cyan-500/15 text-cyan-700 dark:text-cyan-400',
  completed: 'bg-green-500/15 text-green-700 dark:text-green-400',
  pending: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
  failed: 'bg-red-500/15 text-red-700 dark:text-red-400',
  disk_full: 'bg-orange-500/15 text-orange-700 dark:text-orange-400',
  paused: 'bg-purple-500/15 text-purple-700 dark:text-purple-400',
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
        :class="cardBorderClass(dl)"
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
              <p
                v-if="dl.torrentName && dl.torrentName !== dl.label"
                class="text-xs text-zinc-400 dark:text-zinc-500 truncate"
              >
                {{ dl.torrentName }}
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
                  v-if="dl.status === 'completed' && dl.organizeStatus === 'done'"
                  class="text-xs px-2 py-0.5 rounded-full bg-green-500/15 text-green-700 dark:text-green-400"
                >
                  {{ t('download.organizeDone') }}
                </span>
                <span
                  v-if="dl.status === 'completed' && dl.organizeStatus === 'failed'"
                  class="text-xs px-2 py-0.5 rounded-full bg-red-500/15 text-red-700 dark:text-red-400"
                  :title="dl.organizeError ?? undefined"
                >
                  {{ t('download.organizeFailed') }}
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
                  {{ formatDateTime(dl.createdAt, locale) }}
                </span>
              </div>
            </div>

            <UButton
              v-if="
                dl.status === 'downloading' ||
                dl.status === 'pending' ||
                dl.status === 'paused' ||
                dl.status === 'checking'
              "
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
              v-if="
                dl.status === 'downloading' ||
                dl.status === 'pending' ||
                dl.status === 'paused' ||
                dl.status === 'checking'
              "
              icon="i-lucide-trash-2"
              color="error"
              :variant="getTorrentQuality(dl) !== 'ok' ? 'solid' : 'ghost'"
              size="xs"
              :loading="cancelling === dl.id"
              class="sm:hidden"
              @click="cancelTorrent(dl)"
            />
          </div>

          <div
            v-if="dl.status === 'downloading' || dl.status === 'paused' || dl.status === 'checking'"
            class="space-y-2"
          >
            <div class="flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400">
              <span class="font-medium text-zinc-900 dark:text-white">{{ dl.progress.toFixed(1) }}%</span>
              <div class="flex items-center gap-3">
                <span v-if="dl.numSeeds > 0 && dl.status !== 'checking'" class="text-zinc-500 dark:text-zinc-400">
                  <UIcon name="i-lucide-arrow-up" class="inline size-3" />{{ dl.numSeeds }}
                </span>
                <span v-if="dl.numLeechs > 0 && dl.status !== 'checking'" class="text-zinc-400 dark:text-zinc-500">
                  <UIcon name="i-lucide-arrow-down" class="inline size-3" />{{ dl.numLeechs }}
                </span>
                <span v-if="dl.status !== 'paused' && dl.status !== 'checking'"
                  >{{ t('common.eta') }}:
                  <span
                    class="font-medium"
                    :class="
                      etaState(dl) === 'collecting'
                        ? 'animate-pulse text-amber-600 dark:text-amber-400'
                        : 'text-zinc-900 dark:text-white'
                    "
                    >{{ etaLabel(dl) }}</span
                  ></span
                >
              </div>
            </div>
            <div class="w-full h-2 rounded-full bg-zinc-200 dark:bg-white/10">
              <div
                class="h-full min-w-0.5 rounded-full bg-linear-to-r transition-[width] duration-1000 ease-linear"
                :class="dl.status === 'checking' ? 'bg-teal-500' : qualityConfig[getTorrentQuality(dl)].bar"
                :style="{ width: `${Math.max(dl.progress, 0.5)}%` }"
              />
            </div>
            <div
              v-if="dl.status !== 'checking'"
              class="flex items-center justify-between text-xs text-zinc-400 dark:text-zinc-500"
            >
              <span>↓ {{ formatSpeed(dl.downloadSpeed) }} · ↑ {{ formatSpeed(dl.uploadSpeed) }}</span>
              <span>{{ formatSize(dl.downloadedBytes) }} / {{ formatSize(dl.sizeBytes) }}</span>
            </div>
          </div>

          <div v-else-if="dl.status === 'completed'" class="space-y-2">
            <template v-if="dl.notifiedAt === null">
              <div class="flex items-center justify-between text-xs">
                <span class="flex items-center gap-1.5 font-medium text-violet-600 dark:text-violet-400">
                  <UIcon
                    name="i-lucide-package-open"
                    class="size-3.5"
                    :class="dl.organizeProgress ? 'animate-pulse' : ''"
                  />
                  {{ dl.organizeProgress ? t('downloads.prepCopying') : t('downloads.prepTitle') }}
                </span>
                <span class="font-medium text-violet-600 dark:text-violet-400">
                  {{ prepPercent(dl).toFixed(1) }}%
                </span>
              </div>
              <div
                class="w-full h-2.5 rounded-full overflow-hidden bg-violet-500/15 dark:bg-violet-500/10 ring-1 ring-inset ring-violet-500/25"
              >
                <div
                  class="relative h-full rounded-full overflow-hidden bg-linear-to-r from-violet-500 via-fuchsia-500 to-pink-500 shadow-[0_0_10px_rgba(168,85,247,0.45)] transition-[width] duration-1000 ease-linear"
                  :style="{ width: `${Math.max(prepPercent(dl), 1)}%` }"
                >
                  <span class="prep-shimmer absolute inset-0" />
                </div>
              </div>
              <div class="flex items-center justify-between text-xs text-zinc-400 dark:text-zinc-500">
                <span>{{ prepDetail(dl) }}</span>
                <span v-if="dl.organizeProgress">
                  {{ dl.organizeProgress.filesDone }}/{{ dl.organizeProgress.filesTotal }}
                </span>
              </div>
            </template>
            <div v-else class="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
              <UIcon name="i-lucide-check-circle" class="w-4 h-4" />
              <span>{{ t('dashboard.completed') }}</span>
              <span class="text-zinc-400 dark:text-zinc-500">· {{ formatSize(dl.sizeBytes) }}</span>
            </div>
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

<style scoped>
/* Deliberately different from the download bar: violet/fuchsia with a moving
   highlight, so the two phases are never confused at a glance. */
.prep-shimmer {
  background: linear-gradient(110deg, transparent 20%, rgba(255, 255, 255, 0.45) 45%, transparent 70%);
  background-size: 220% 100%;
  animation: prep-shimmer 1.6s linear infinite;
}

@keyframes prep-shimmer {
  from {
    background-position: 220% 0;
  }
  to {
    background-position: -120% 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .prep-shimmer {
    animation: none;
    opacity: 0.35;
  }
}
</style>
