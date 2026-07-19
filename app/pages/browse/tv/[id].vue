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

    <div class="relative z-10 flex flex-col gap-8 lg:flex-row">
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
            class="cursor-pointer"
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
            class="cursor-pointer"
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
          <div class="flex flex-col gap-4">
            <BrowseSeasonPackCard
              v-for="(pack, idx) in seasonData.seasonPacks"
              :key="'pack-' + idx"
              :pack="pack"
              :loading="downloadingPackIdx === idx"
              :disabled="
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
                  pack.size
                )
              "
              @toggle-debug="toggleDebug(`pack-${idx}`)"
            />
          </div>
        </div>

        <div class="flex flex-col gap-4">
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
                  payload.size
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
const downloadingKey = ref<string | null>(null)
const downloadingPackIdx = ref<number | null>(null)
const requesting = ref(false)
const requestStatus = ref<RequestStatus>(null)
const rejectedAdminNote = ref<string | null>(null)
const wishlisted = ref(false)
const wishlistId = ref<string | null>(null)
const debugOpenKey = ref<string | null>(null)
const requestModalOpen = ref(false)
const requestNote = ref('')
const { t, locale } = useI18n()
const { user } = useUserSession()

const isDev = computed(() => import.meta.dev && user.value?.role === 'admin')

function toggleDebug(key: string) {
  debugOpenKey.value = debugOpenKey.value === key ? null : key
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
    const res = await $fetch<{ status: string | null; adminNote: string | null }>(
      `/api/requests/mine?mediaType=tv&mediaId=${show.value.id}`
    )
    requestStatus.value = res.status as 'pending' | 'accepted' | 'rejected' | null
    rejectedAdminNote.value = res.adminNote
  } catch {
    // not logged in or error
  }
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

watchEffect(async () => {
  if (!show.value) return
  try {
    const res = await $fetch<{ wishlisted: boolean; id: string | null }>(
      `/api/wishlist/check?mediaType=tv&mediaId=${show.value.id}`
    )
    wishlisted.value = res.wishlisted
    wishlistId.value = res.id
  } catch {
    // not logged in or error
  }
})

async function toggleWishlist() {
  if (!show.value) return
  const toast = useToast()
  try {
    if (wishlisted.value) {
      await $fetch('/api/wishlist', { method: 'DELETE', body: { mediaType: 'tv', mediaId: show.value.id } })
      wishlisted.value = false
      wishlistId.value = null
      toast.add({ title: t('wishlist.removedFromWishlist'), color: 'success' })
    } else {
      const res = await $fetch<{ id: string }>('/api/wishlist', {
        method: 'POST',
        body: {
          mediaType: 'tv',
          mediaId: show.value.id,
          mediaTitle: show.value.name,
          mediaPoster: show.value.posterUrl
        }
      })
      wishlisted.value = true
      wishlistId.value = res.id
      toast.add({
        title: t('wishlist.addedToWishlist'),
        description: t('wishlist.addedToWishlistDesc', { title: show.value.name }),
        color: 'success'
      })
    }
  } catch {
    toast.add({ title: t('wishlist.failed'), color: 'error' })
  }
}
</script>
