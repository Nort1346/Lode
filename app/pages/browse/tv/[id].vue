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
        class="h-full w-full bg-linear-to-b from-white/90 via-white/70 to-default dark:from-black/95 dark:via-black/70"
      />
    </div>

    <div v-reveal="'fade'" class="relative z-10 flex flex-col gap-8 lg:flex-row">
      <div class="shrink-0">
        <img
          v-if="show.posterUrl"
          :src="show.posterUrl"
          :alt="show.name"
          class="mx-auto w-48 rounded-xl shadow-2xl lg:mx-0 lg:w-64"
        />
      </div>

      <div class="flex-1">
        <div class="flex items-center gap-3">
          <h1 class="text-3xl font-bold text-zinc-900 dark:text-white lg:text-4xl">{{ show.name }}</h1>
          <InLibraryBadge v-if="show.inLibrary" />
        </div>
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
          <UDropdownMenu :items="languageDropdownItems">
            <UButton
              variant="ghost"
              size="sm"
              icon="i-lucide-languages"
              :label="getCurrentLanguageLabel(show?.originalLanguage)"
              trailing-icon="i-lucide-chevron-down"
              class="text-zinc-500 dark:text-zinc-400 hover:text-amber-500 dark:hover:text-amber-400"
            />
          </UDropdownMenu>
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

        <a
          v-if="show.imdbId"
          :href="`https://www.imdb.com/title/${show.imdbId}/`"
          target="_blank"
          rel="noopener noreferrer"
          class="mt-4 inline-flex items-center gap-1 text-sm text-zinc-600 dark:text-zinc-400 hover:text-amber-500 transition-colors"
        >
          <UIcon name="i-lucide-external-link" class="size-3.5" />
          IMDB: {{ show.imdbId }}
        </a>

        <div class="mt-4 flex flex-wrap items-center gap-3">
          <UButton
            v-if="requestStatus === null"
            color="primary"
            variant="soft"
            icon="i-lucide-message-square-plus"
            :loading="requesting"
            @click="openRequestModal"
          >
            {{ t('requests.requestThis') }}
          </UButton>
          <span v-else-if="requestStatus === 'pending'" class="inline-flex items-center gap-2 text-sm text-amber-500">
            <UIcon name="i-lucide-clock" class="size-4" />
            {{ t('requests.pending') }}
          </span>
          <span v-else-if="requestStatus === 'accepted'" class="inline-flex items-center gap-2 text-sm text-green-500">
            <UIcon name="i-lucide-check-circle" class="size-4" />
            {{ t('requests.accepted') }}
          </span>
          <span v-else-if="requestStatus === 'rejected'" class="inline-flex items-center gap-2 text-sm text-red-500">
            <UIcon name="i-lucide-x-circle" class="size-4" />
            {{ t('requests.rejected') }}
          </span>
          <p
            v-if="requestStatus === 'rejected' && rejectedAdminNote"
            class="w-full text-xs text-zinc-500 dark:text-zinc-400 italic"
          >
            {{ t('requests.adminResponse') }}: {{ rejectedAdminNote }}
          </p>
          <UButton
            color="error"
            variant="soft"
            :icon="wishlisted ? 'i-lucide-heart-off' : 'i-lucide-heart'"
            @click="toggleWishlist"
          >
            {{ wishlisted ? t('wishlist.alreadyInWishlist') : t('wishlist.addToWishlist') }}
          </UButton>
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
          <div class="flex flex-col gap-4 torrent-list">
            <BrowseSeasonPackCard
              v-for="(pack, idx) in seasonData.seasonPacks"
              :key="'pack-' + idx"
              :pack="pack"
              :loading="downloadingPackIdx === idx"
              :disabled="
                downloadActive ||
                (pack.magnetLink === null && pack.guid === null && pack.downloadUrl === null) ||
                isPrivateLimitExceeded(pack.isPrivate)
              "
              :limit-exceeded="isPrivateLimitExceeded(pack.isPrivate)"
              :is-dev="isDev"
              :debug-open="debugOpenKey === `pack-${idx}`"
              @download="
                downloadTorrent(
                  pack.magnetLink,
                  `${show?.name ?? ''} S${String(selectedSeason).padStart(2, '0')} Season Pack`,
                  String(idx),
                  'pack',
                  pack.guid,
                  pack.indexer,
                  pack.downloadUrl,
                  pack.size,
                  pack.resolution
                )
              "
              @toggle-debug="toggleDebug(`pack-${idx}`)"
            />
          </div>
        </div>

        <div class="flex flex-col gap-4 torrent-list">
          <BrowseEpisodeCard
            v-for="ep in seasonData.episodes"
            :key="ep.id"
            :episode="ep"
            :show-name="show?.name ?? ''"
            :selected-season="selectedSeason"
            :downloading-key="downloadingKey"
            :is-dev="isDev"
            :debug-key="debugOpenKey"
            :is-private-limit-exceeded="isPrivateLimitExceeded"
            @download-torrent="
              (payload) =>
                downloadTorrent(
                  payload.magnetLink,
                  payload.label,
                  payload.key,
                  payload.type,
                  payload.guid,
                  payload.indexer,
                  payload.downloadUrl,
                  payload.size,
                  payload.resolution
                )
            "
            @toggle-debug="(key) => toggleDebug(key)"
          />
        </div>
      </div>
    </div>

    <UModal v-model:open="requestModalOpen">
      <template #header>
        <h3 class="text-xl font-semibold text-zinc-900 dark:text-white">{{ show?.name }}</h3>
      </template>
      <template #body>
        <UFormField :label="t('requests.messageToAdmin')">
          <UInput
            v-model="requestNote"
            :placeholder="t('requests.messagePlaceholder')"
            :maxlength="255"
            class="w-full"
            @keydown.enter.prevent
          />
          <p class="mt-1 text-xs text-zinc-400 dark:text-zinc-500 text-right">{{ requestNote.length }}/255</p>
        </UFormField>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton :label="t('common.cancel')" variant="soft" @click="void (requestModalOpen = false)" />
          <UButton :label="t('requests.requestThis')" :loading="requesting" @click="submitRequest" />
        </div>
      </template>
    </UModal>
  </div>
</template>

<script setup lang="ts">
import type { ShowData, SeasonData } from '~/types/browse'
import type { RequestStatus } from '~/types/requests'

const route = useRoute()
const selectedSeason = ref(1)

// The component is reused when navigating show -> show: a show with fewer seasons must
// not keep requesting the previous show's selected season
watch(
  () => route.params.id,
  () => {
    selectedSeason.value = 1
  }
)
const downloadingKey = ref<string | null>(null)
const downloadingPackIdx = ref<number | null>(null)
const { active: downloadActive, startDownload, finishDownload } = useDownloadOverlay()
const requesting = ref(false)
const requestStatus = ref<RequestStatus>(null)
const rejectedAdminNote = ref<string | null>(null)
const wishlisted = ref(false)

const debugOpenKey = ref<string | null>(null)
const requestModalOpen = ref(false)
const requestNote = ref('')
const { t } = useI18n()
const toast = useToast()
const { user } = useUserSession()

const isDev = computed(() => import.meta.dev && user.value?.role === 'admin')

function toggleDebug(key: string) {
  debugOpenKey.value = debugOpenKey.value === key ? null : key
}

const { mediaLanguage, getLanguageOptions, getCurrentLanguageLabel } = useMediaLanguage()

const languageDropdownItems = computed(() =>
  getLanguageOptions(show.value?.originalLanguage).map((opt) => ({
    label: opt.label,
    icon: opt.icon,
    onSelect() {
      mediaLanguage.value = opt.value
    }
  }))
)

// route.params.id is typed string | string[] | undefined, but on this dynamic route it is always a plain string
const mediaId = computed(() => (typeof route.params.id === 'string' ? route.params.id : ''))

const {
  data: showData,
  pending,
  error
} = await useFetch<{ show: ShowData }>(
  computed(() => `/api/browse/tv/${mediaId.value}?locale=${mediaLanguage.value}`),
  { watch: [mediaLanguage] }
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
  computed(() => `/api/browse/tv/${mediaId.value}/season/${selectedSeason.value}?locale=${mediaLanguage.value}`),
  { watch: [selectedSeason, mediaLanguage] }
)

const seasonLimitInfo = computed(() => {
  if (seasonError.value === null || seasonError.value === undefined) return null
  if (getApiStatusCode(seasonError.value) !== 429) return null
  const err = seasonError.value as unknown as Record<string, unknown>
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
  torrentSize?: number,
  resolution?: string | null
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
  startDownload(label || t('download.adding'))

  try {
    const res = await $fetch<{ already?: boolean }>('/api/browse/download', {
      method: 'POST',
      body: {
        magnetLink: magnetLink ?? '',
        downloadUrl: downloadUrl ?? '',
        guid: guid ?? '',
        indexer: indexer ?? '',
        resolution: resolution ?? null,
        label,
        savePath: 'series',
        tmdbId: show.value?.id ?? null,
        mediaType: 'tv',
        torrentSize: torrentSize ?? 0
      }
    })
    if (res.already === true) {
      toast.add({ title: t('download.already'), description: t('download.alreadyDesc', { label }), color: 'info' })
      await navigateTo('/dashboard/downloads')
      return
    }
    toast.add({ title: t('download.added'), description: t('download.addedDesc', { label }), color: 'success' })
    await navigateTo('/dashboard/downloads')
  } catch (err) {
    const status = getApiStatusCode(err)
    if (status === 507) {
      toast.add({
        title: t('download.diskFull'),
        description: err instanceof Error ? err.message : undefined,
        color: 'warning'
      })
    } else if (status === 413) {
      toast.add({
        title: t('download.sizeLimit'),
        description: err instanceof Error ? err.message : undefined,
        color: 'warning'
      })
    } else {
      const msg = err instanceof Error ? err.message : t('download.errorDesc')
      toast.add({ title: t('download.error'), description: msg, color: 'error' })
    }
  } finally {
    downloadingKey.value = null
    downloadingPackIdx.value = null
    finishDownload()
  }
}

// When navigating show -> show the component is reused: a slow response for the previous
// show must not overwrite the new show's request status
let requestStatusSeq = 0

async function loadRequestStatus(showId: number, seq: number) {
  try {
    const res = await $fetch<{ status: string | null; adminNote: string | null }>(
      `/api/requests/mine?mediaType=tv&mediaId=${showId}`
    )
    if (seq !== requestStatusSeq) return
    requestStatus.value = res.status as 'pending' | 'accepted' | 'rejected' | null
    rejectedAdminNote.value = res.adminNote
  } catch {
    // not logged in or error
  }
}

watchEffect(() => {
  const showData = show.value
  if (!showData) return
  void loadRequestStatus(showData.id, ++requestStatusSeq)
})

function openRequestModal() {
  requestNote.value = ''
  requestModalOpen.value = true
}

async function submitRequest() {
  if (!show.value) return
  requesting.value = true
  try {
    await $fetch('/api/requests/post', {
      method: 'POST',
      body: {
        mediaType: 'tv',
        mediaId: show.value.id,
        mediaTitle: show.value.name,
        mediaPoster: show.value.posterUrl,
        userNote: requestNote.value || null
      }
    })
    requestStatus.value = 'pending'
    requestModalOpen.value = false
    toast.add({
      title: t('requests.requestSuccess'),
      description: t('requests.requestSuccessDesc'),
      color: 'success'
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : t('requests.alreadyRequested')
    toast.add({ title: t('requests.alreadyRequested'), description: msg, color: 'warning' })
  } finally {
    requesting.value = false
  }
}

let wishlistSeq = 0

async function loadWishlistState(showId: number, seq: number) {
  try {
    const res = await $fetch<{ wishlisted: boolean }>(`/api/wishlist/check?mediaType=tv&mediaId=${showId}`)
    if (seq !== wishlistSeq) return
    wishlisted.value = res.wishlisted
  } catch {
    // not logged in or error
  }
}

watchEffect(() => {
  const showData = show.value
  if (!showData) return
  void loadWishlistState(showData.id, ++wishlistSeq)
})

async function toggleWishlist() {
  const showData = show.value
  if (!showData) return
  try {
    if (wishlisted.value) {
      await $fetch('/api/wishlist', { method: 'DELETE', body: { mediaType: 'tv', mediaId: showData.id } })
      wishlisted.value = false
      toast.add({ title: t('wishlist.removedFromWishlist'), color: 'success' })
    } else {
      await $fetch('/api/wishlist', {
        method: 'POST',
        body: {
          mediaType: 'tv',
          mediaId: showData.id,
          mediaTitle: showData.name,
          mediaPoster: showData.posterUrl
        }
      })
      wishlisted.value = true
      toast.add({
        title: t('wishlist.addedToWishlist'),
        description: t('wishlist.addedToWishlistDesc', { title: showData.name }),
        color: 'success'
      })
    }
  } catch {
    toast.add({ title: t('wishlist.failed'), color: 'error' })
  }
}
</script>
