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
        <USkeleton class="h-4 w-40 rounded" />
        <USkeleton class="h-9 w-36 rounded-lg" />
      </div>
    </div>
    <div class="space-y-2">
      <USkeleton class="h-10 w-48 rounded-xl" />
      <USkeleton class="h-20 w-full rounded-xl" />
      <USkeleton class="h-20 w-full rounded-xl" />
      <USkeleton class="h-20 w-full rounded-xl" />
    </div>
  </div>

  <div v-else-if="error || !movie" class="rounded-xl bg-red-500/10 p-6 text-center text-red-500 dark:text-red-400">
    {{ t('movie.loadError') }}
  </div>

  <div v-else>
    <div
      v-if="movie.backdropUrl"
      class="fixed top-0 left-0 z-0 h-[70vh] w-full bg-cover bg-center"
      :style="{
        backgroundImage: `url(${movie.backdropUrl})`,
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
          v-if="movie.posterUrl"
          :src="movie.posterUrl"
          :alt="movie.title"
          class="mx-auto w-48 rounded-xl shadow-2xl lg:mx-0 lg:w-64"
        />
      </div>

      <div class="flex-1">
        <div class="flex items-center gap-3">
          <h1 class="text-3xl font-bold text-zinc-900 dark:text-white lg:text-4xl">{{ movie.title }}</h1>
          <InLibraryBadge v-if="movie.inLibrary" />
        </div>
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

        <a
          v-if="movie.imdbId"
          :href="`https://www.imdb.com/title/${movie.imdbId}/`"
          target="_blank"
          rel="noopener noreferrer"
          class="mt-4 inline-flex items-center gap-1 text-sm text-zinc-600 dark:text-zinc-400 hover:text-amber-500 transition-colors"
        >
          <UIcon name="i-lucide-external-link" class="size-3.5" />
          IMDB: {{ movie.imdbId }}
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
      <h2 class="mb-4 text-xl font-bold text-zinc-900 dark:text-white">
        <UIcon name="i-lucide-download" class="mr-2 inline size-5" />
        {{ t('movie.availableTorrents') }}
      </h2>

      <div v-if="torrentsPending" class="space-y-2">
        <USkeleton class="h-20 w-full rounded-xl" />
        <USkeleton class="h-20 w-full rounded-xl" />
        <USkeleton class="h-20 w-full rounded-xl" />
      </div>

      <div
        v-else-if="limitInfo"
        class="rounded-xl border border-amber-500/50 bg-amber-500/10 p-8 text-center dark:bg-amber-500/5"
      >
        <UIcon name="i-lucide-alert-triangle" class="mx-auto mb-3 size-10 text-amber-500" />
        <h3 class="mb-2 text-lg font-bold text-amber-600 dark:text-amber-400">
          {{ t('browse.limitReached') }}
        </h3>
        <div class="mb-2 flex items-center justify-center gap-4 text-sm text-zinc-700 dark:text-zinc-300">
          <span>{{ t('browse.limitActive', { active: limitInfo.activeCount, limit: limitInfo.limit }) }}</span>
          <span class="text-zinc-400 dark:text-zinc-500">·</span>
          <span>{{ t('browse.limitToday', { today: limitInfo.todayCount, limit: limitInfo.limit }) }}</span>
        </div>
        <p class="text-xs text-zinc-500 dark:text-zinc-400">{{ t('browse.limitResetInfo') }}</p>
      </div>

      <div
        v-else-if="torrents.length === 0"
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
              ? 'border-amber-400 bg-white/50 shadow-md shadow-amber-500/10 dark:border-amber-500/50 dark:bg-amber-500/5'
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
                  torrent.percentage >= 80
                    ? 'text-emerald-500'
                    : torrent.percentage >= 60
                      ? 'text-amber-500'
                      : 'text-zinc-500'
                "
              >
                {{ torrent.percentage }}%
              </div>
            </div>
            <UButton
              :color="isPrivateLimitExceeded(torrent) ? 'error' : 'warning'"
              icon="i-lucide-download"
              class="cursor-pointer"
              :loading="downloadingIdx === idx"
              :disabled="
                (torrent.magnetLink === null && torrent.guid === null && torrent.downloadUrl === null) ||
                isPrivateLimitExceeded(torrent)
              "
              @click="downloadTorrent(torrent, idx)"
            >
              {{ isPrivateLimitExceeded(torrent) ? t('movie.limitReached') : t('movie.download') }}
            </UButton>
            <UButton
              v-if="isDev"
              size="xs"
              color="neutral"
              variant="ghost"
              icon="i-lucide-bug"
              @click="toggleDebug(idx)"
            />
          </div>
          <div
            v-if="isDev && debugOpenIdx === idx"
            class="mt-2 rounded-lg border border-zinc-200 bg-zinc-50 p-3 font-mono text-xs dark:border-zinc-700 dark:bg-zinc-900"
          >
            <div class="mb-2 flex items-center gap-2 font-bold text-zinc-500 dark:text-zinc-400">
              <UIcon name="i-lucide-bug" class="size-3" />
              Dev Info
            </div>
            <div class="space-y-1.5">
              <div class="flex items-center gap-2">
                <span class="w-24 text-zinc-400">indexer:</span>
                <span class="text-zinc-700 dark:text-zinc-300">{{ torrent.indexer }}</span>
              </div>
              <div class="flex items-center gap-2">
                <span class="w-24 text-zinc-400">magnetLink:</span>
                <span
                  class="max-w-xs truncate"
                  :class="torrent.magnetLink ? 'text-emerald-600 dark:text-emerald-400' : 'text-zinc-400'"
                >
                  {{ torrent.magnetLink ?? '-' }}
                </span>
                <UButton
                  v-if="torrent.magnetLink"
                  size="xs"
                  color="neutral"
                  variant="ghost"
                  icon="i-lucide-copy"
                  @click="copyToClipboard(torrent.magnetLink!)"
                />
              </div>
              <div class="flex items-center gap-2">
                <span class="w-24 text-zinc-400">downloadUrl:</span>
                <span
                  class="max-w-xs truncate"
                  :class="torrent.downloadUrl ? 'text-emerald-600 dark:text-emerald-400' : 'text-zinc-400'"
                >
                  {{ torrent.downloadUrl ?? '-' }}
                </span>
                <UButton
                  v-if="torrent.downloadUrl"
                  size="xs"
                  color="neutral"
                  variant="ghost"
                  icon="i-lucide-copy"
                  @click="copyToClipboard(torrent.downloadUrl!)"
                />
              </div>
              <div class="flex items-center gap-2">
                <span class="w-24 text-zinc-400">guid:</span>
                <span
                  class="max-w-xs truncate"
                  :class="torrent.guid ? 'text-emerald-600 dark:text-emerald-400' : 'text-zinc-400'"
                >
                  {{ torrent.guid ?? '-' }}
                </span>
                <UButton
                  v-if="torrent.guid"
                  size="xs"
                  color="neutral"
                  variant="ghost"
                  icon="i-lucide-copy"
                  @click="copyToClipboard(torrent.guid!)"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <UModal v-model:open="requestModalOpen">
      <template #header>
        <h3 class="text-xl font-semibold text-zinc-900 dark:text-white">{{ movie?.title }}</h3>
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
import type { Torrent } from '~/types/media'
import type { MovieData } from '~/types/browse'
import type { RequestStatus } from '~/types/requests'
import { useCopyToClipboard } from '~/composables/useClipboard'

const route = useRoute()
const downloadingIdx = ref<number | null>(null)
const requesting = ref(false)
const requestStatus = ref<RequestStatus>(null)
const rejectedAdminNote = ref<string | null>(null)
const wishlisted = ref(false)
const wishlistId = ref<string | null>(null)
const debugOpenIdx = ref<number | null>(null)
const requestModalOpen = ref(false)
const requestNote = ref('')
const { t, locale } = useI18n()
const { user } = useUserSession()

const isDev = computed(() => import.meta.dev && user.value?.role === 'admin')

function toggleDebug(idx: number) {
  debugOpenIdx.value = debugOpenIdx.value === idx ? null : idx
}

const { copyToClipboard } = useCopyToClipboard()

const { data, pending, error } = await useFetch<{ movie: MovieData }>(
  computed(() => `/api/browse/movie/${route.params.id}?locale=${locale.value}`),
  { watch: [locale] }
)

const {
  data: torrentData,
  pending: torrentsPending,
  error: torrentError
} = useLazyFetch<{ torrents: Torrent[] }>(
  computed(() => `/api/browse/movie/${route.params.id}/torrents?locale=${locale.value}`),
  { watch: [locale] }
)

const movie = computed(() => data.value?.movie ?? null)

const torrents = computed(() => torrentData.value?.torrents ?? [])
const { data: limits } = useFetch('/api/user/limits')
const limitInfo = computed(() => {
  if (torrentError.value === null || torrentError.value === undefined) return null
  const err = torrentError.value as unknown as Record<string, unknown>
  const status = err.status ?? err.statusCode
  if (status !== 429) return null
  const body = err.data as Record<string, unknown> | undefined
  if (body !== null && body !== undefined && 'activeCount' in body) return body
  const nested = body?.data as Record<string, unknown> | undefined
  if (nested !== null && nested !== undefined && 'activeCount' in nested) return nested
  return null
})

function isPrivateLimitExceeded(torrent: Torrent): boolean {
  if (!torrent.isPrivate) return false
  if (!limits.value) return false
  return limits.value.todayPrivate >= limits.value.privateLimit
}

function formatLanguage(lang: string): string {
  const map: Record<string, string> = {
    'pl-dub': 'PL Dubbing',
    'pl-sub': 'PL Napisy',
    'pl-lektor': 'PL Lektor',
    en: 'English'
  }
  return map[lang] ?? lang
}

watchEffect(async () => {
  if (!movie.value?.imdbId) return
  try {
    const res = await $fetch<{ status: string | null; adminNote: string | null }>(
      `/api/requests/mine?mediaType=movie&mediaId=${movie.value.id}`
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
  if (!movie.value) return
  requesting.value = true
  try {
    await $fetch('/api/requests/post', {
      method: 'POST',
      body: {
        mediaType: 'movie',
        mediaId: movie.value.id,
        mediaTitle: movie.value.title,
        mediaPoster: movie.value.posterUrl,
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
  if (!movie.value) return
  try {
    const res = await $fetch<{ wishlisted: boolean; id: string | null }>(
      `/api/wishlist/check?mediaType=movie&mediaId=${movie.value.id}`
    )
    wishlisted.value = res.wishlisted
    wishlistId.value = res.id
  } catch {
    // not logged in or error
  }
})

async function toggleWishlist() {
  if (!movie.value) return
  const toast = useToast()
  try {
    if (wishlisted.value) {
      await $fetch('/api/wishlist', { method: 'DELETE', body: { mediaType: 'movie', mediaId: movie.value.id } })
      wishlisted.value = false
      wishlistId.value = null
      toast.add({ title: t('wishlist.removedFromWishlist'), color: 'success' })
    } else {
      const res = await $fetch<{ id: string }>('/api/wishlist', {
        method: 'POST',
        body: {
          mediaType: 'movie',
          mediaId: movie.value.id,
          mediaTitle: movie.value.title,
          mediaPoster: movie.value.posterUrl
        }
      })
      wishlisted.value = true
      wishlistId.value = res.id
      toast.add({
        title: t('wishlist.addedToWishlist'),
        description: t('wishlist.addedToWishlistDesc', { title: movie.value.title }),
        color: 'success'
      })
    }
  } catch {
    toast.add({ title: t('wishlist.failed'), color: 'error' })
  }
}

async function downloadTorrent(torrent: Torrent, idx: number) {
  const hasMagnet = torrent.magnetLink !== null && torrent.magnetLink.length > 0
  const hasGuid = torrent.guid !== null && torrent.guid.length > 0
  const hasDownloadUrl = torrent.downloadUrl !== null && torrent.downloadUrl.length > 0
  if (!hasMagnet && !hasGuid && !hasDownloadUrl) return
  downloadingIdx.value = idx

  try {
    await $fetch('/api/browse/download', {
      method: 'POST',
      body: {
        magnetLink: torrent.magnetLink ?? '',
        downloadUrl: torrent.downloadUrl ?? '',
        guid: torrent.guid ?? '',
        indexer: torrent.indexer,
        label: movie.value?.title ?? 'Film',
        savePath: 'movies',
        tmdbId: movie.value?.id ?? null,
        mediaType: 'movie',
        torrentSize: torrent.size
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
