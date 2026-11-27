<template>
  <div>
    <section
      v-reveal="'fade'"
      class="relative overflow-hidden rounded-3xl border border-zinc-200/80 bg-white/70 px-5 py-6 shadow-sm backdrop-blur-sm sm:px-7 sm:py-8 dark:border-white/8 dark:bg-white/[0.03]"
    >
      <div
        class="pointer-events-none absolute -top-24 -right-16 size-64 rounded-full bg-amber-400/20 blur-3xl dark:bg-amber-500/10"
      />
      <div
        class="pointer-events-none absolute -bottom-32 left-1/3 size-72 rounded-full bg-orange-300/10 blur-3xl dark:bg-orange-500/5"
      />
      <UIcon
        name="i-lucide-library-big"
        class="pointer-events-none absolute -right-6 -bottom-12 size-56 text-amber-500/5 dark:text-amber-400/5"
      />

      <div class="relative flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
        <div class="max-w-2xl">
          <p
            class="inline-flex items-center gap-2 rounded-full border border-amber-500/20 bg-amber-500/10 px-3 py-1 text-[11px] font-semibold tracking-[0.16em] text-amber-700 uppercase dark:text-amber-300"
          >
            <span class="size-1.5 rounded-full bg-amber-500" />
            {{ t('library.eyebrow') }}
          </p>
          <h1 class="mt-4 text-3xl font-black tracking-tight text-zinc-900 sm:text-4xl dark:text-white">
            {{ t('library.title') }}
          </h1>
          <p class="mt-2 max-w-xl text-sm leading-relaxed text-zinc-600 sm:text-base dark:text-zinc-400">
            {{ t('library.subtitle') }}
          </p>
        </div>

        <div class="grid w-full grid-cols-2 gap-2 sm:grid-cols-4 xl:mt-0 xl:max-w-xl">
          <div
            v-for="stat in stats"
            :key="stat.key"
            class="rounded-2xl border border-zinc-200/70 bg-white/70 px-3.5 py-3 backdrop-blur-sm dark:border-white/8 dark:bg-white/5"
          >
            <div
              class="flex items-center gap-1.5 text-[10px] font-semibold tracking-[0.12em] text-zinc-500 uppercase dark:text-zinc-400"
            >
              <UIcon :name="stat.icon" class="size-3.5 text-amber-600 dark:text-amber-400" />
              {{ stat.label }}
            </div>
            <USkeleton v-if="loading" class="mt-2 h-7 w-12 rounded-md" />
            <p v-else class="mt-1 text-2xl font-bold text-zinc-900 tabular-nums dark:text-white">
              {{ stat.value }}
            </p>
          </div>
        </div>
      </div>
    </section>

    <div ref="sentinelRef" class="mt-6 h-px" aria-hidden="true" />

    <div
      v-reveal="'fade'"
      class="sticky z-20 -mx-4 border-b border-transparent px-4 py-3 transition-[background-color,border-color,box-shadow] duration-200 motion-reduce:transition-none lg:-mx-6 lg:top-0 lg:px-6"
      :class="
        stuck ? 'border-zinc-200/70 bg-white/85 shadow-sm backdrop-blur-md dark:border-white/8 dark:bg-zinc-900/85' : ''
      "
      :style="barTopStyle"
    >
      <div class="flex flex-col gap-3">
        <div class="flex flex-col gap-2 sm:flex-row sm:items-center">
          <UInput
            v-model="query"
            :placeholder="t('library.searchPlaceholder')"
            :aria-label="t('library.searchLabel')"
            leading-icon="i-lucide-search"
            size="xl"
            :ui="{ base: 'h-11' }"
            class="w-full min-w-0 flex-1"
            autocomplete="off"
            spellcheck="false"
            enterkeyhint="search"
            @keydown.esc="query = ''"
          >
            <template #trailing>
              <UButton
                v-if="query.length > 0"
                type="button"
                color="neutral"
                variant="link"
                size="sm"
                icon="i-lucide-x"
                :aria-label="t('library.clearSearch')"
                @click="query = ''"
              />
            </template>
          </UInput>

          <div class="flex items-center gap-2">
            <USelect
              :model-value="sort"
              :items="sortOptions"
              :aria-label="t('library.sortBy')"
              size="xl"
              class="min-w-0 flex-1 sm:w-44"
              @update:model-value="onSortChange"
            />
            <UButton
              :icon="directionIcon"
              color="neutral"
              variant="outline"
              size="xl"
              :aria-label="t('library.sortDirection')"
              :title="directionLabel"
              @click="toggleDirection"
            />
            <UButton
              icon="i-lucide-refresh-cw"
              color="neutral"
              variant="outline"
              size="xl"
              :loading="refreshing"
              :aria-label="t('library.refresh')"
              :title="t('library.refresh')"
              @click="refreshLibrary"
            />
          </div>
        </div>

        <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div
            role="tablist"
            :aria-label="t('library.title')"
            class="relative grid w-full grid-cols-2 rounded-xl border border-zinc-200 bg-zinc-100/80 p-1 sm:w-72 dark:border-white/10 dark:bg-white/5"
          >
            <span
              aria-hidden="true"
              class="pointer-events-none absolute inset-y-1 left-1 w-[calc(50%-0.25rem)] rounded-lg bg-white shadow-sm ring-1 ring-black/5 transition-transform duration-300 ease-out motion-reduce:transition-none dark:bg-zinc-800 dark:ring-white/10"
              :class="activeType === 'series' ? 'translate-x-full' : ''"
            />
            <button
              v-for="tab in tabs"
              :key="tab.value"
              type="button"
              role="tab"
              :aria-selected="activeType === tab.value"
              class="relative z-10 flex h-9 items-center justify-center gap-2 rounded-lg text-sm transition-colors duration-200 motion-reduce:transition-none"
              :class="
                activeType === tab.value
                  ? 'font-semibold text-zinc-900 dark:text-white'
                  : 'font-medium text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200'
              "
              @click="activeType = tab.value"
            >
              <UIcon :name="tab.icon" class="size-4" />
              {{ tab.label }}
              <span
                v-if="!loading"
                class="rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums"
                :class="
                  activeType === tab.value
                    ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                    : 'bg-zinc-200/70 text-zinc-500 dark:bg-white/10 dark:text-zinc-400'
                "
              >
                {{ tab.count }}
              </span>
            </button>
          </div>

          <p v-if="showResultsMeta" class="text-xs font-medium text-zinc-500 tabular-nums dark:text-zinc-400">
            {{ t('library.showing', { shown: visibleItems.length, total: activeTypeItems.length }) }}
          </p>
        </div>
      </div>
    </div>

    <div class="mt-5">
      <div
        v-if="loading"
        class="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6"
        aria-busy="true"
      >
        <div v-for="n in 12" :key="`library-skeleton-${n}`">
          <USkeleton class="aspect-2/3 w-full rounded-2xl" />
          <USkeleton class="mt-3 h-4 w-3/4 rounded" />
          <USkeleton class="mt-1.5 h-3 w-1/2 rounded" />
        </div>
      </div>

      <LibraryEmptyState
        v-else-if="showOffline"
        icon="i-lucide-cloud-off"
        :title="t('library.offlineTitle')"
        :description="t('library.offlineDesc')"
      >
        <UButton icon="i-lucide-refresh-cw" :label="t('library.retry')" @click="loadLibrary()" />
      </LibraryEmptyState>

      <LibraryEmptyState
        v-else-if="showUnconfigured"
        icon="i-lucide-server-off"
        :title="t('library.notConfiguredTitle')"
        :description="t('library.notConfiguredDesc')"
      >
        <UButton
          v-if="isAdmin"
          to="/admin/settings"
          icon="i-lucide-settings"
          color="neutral"
          variant="soft"
          :label="t('library.openSettings')"
        />
      </LibraryEmptyState>

      <LibraryEmptyState
        v-else-if="showEmpty"
        icon="i-lucide-library-big"
        :title="t('library.emptyTitle')"
        :description="t('library.emptyDesc')"
      >
        <UButton
          icon="i-lucide-refresh-cw"
          color="neutral"
          variant="soft"
          :label="t('library.refresh')"
          :loading="refreshing"
          @click="refreshLibrary"
        />
      </LibraryEmptyState>

      <LibraryEmptyState
        v-else-if="visibleItems.length === 0"
        icon="i-lucide-search-x"
        :title="t('library.noResultsTitle')"
        :description="t('library.noResultsDesc')"
      >
        <UButton
          v-if="query.length > 0"
          icon="i-lucide-x"
          color="neutral"
          variant="soft"
          :label="t('library.clearSearch')"
          @click="query = ''"
        />
      </LibraryEmptyState>

      <TransitionGroup
        v-else
        name="library-card"
        tag="div"
        class="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6"
      >
        <LibraryCard
          v-for="(item, index) in visibleItems"
          :key="item.id"
          :item="item"
          :style="`--i: ${index}`"
          @select="openDetails"
        />
      </TransitionGroup>
    </div>

    <LibraryDetailsModal v-model:open="detailsOpen" :item="selected" />
  </div>
</template>

<script setup lang="ts">
import type {
  LibraryItem,
  LibraryMediaType,
  LibraryResponse,
  LibrarySortDirection,
  LibrarySortKey
} from '#shared/library'
import { emptyLibraryStats, isLibrarySortKey } from '#shared/library'
import type { LibrarySortOption, LibraryStat, LibraryTab } from '~/types/library'
import { defaultLibraryDirection, filterLibraryItems, sortLibraryItems } from '~/utils/library'

definePageMeta({
  middleware: 'auth'
})

const { t, locale } = useI18n()
const { user } = useUserSession()
const toast = useToast()
const { smallerThan } = useBreakpoints()

useSeoMeta({
  title: () => `${t('library.title')} | ${t('seo.title')}`
})

const isAdmin = computed(() => user.value?.role === 'admin')

const data = ref<LibraryResponse | null>(null)
const loading = ref(true)
const loadFailed = ref(false)
const refreshing = ref(false)

const items = computed(() => data.value?.items ?? [])
const libraryStats = computed(() => data.value?.stats ?? emptyLibraryStats())

const activeType = ref<LibraryMediaType>('movie')
const query = ref('')
const sort = ref<LibrarySortKey>('added')
const direction = ref<LibrarySortDirection>('desc')

const counts = computed(() => {
  let movies = 0
  let series = 0
  for (const item of items.value) {
    if (item.type === 'movie') movies += 1
    else series += 1
  }
  return { movie: movies, series }
})

const tabs = computed<LibraryTab[]>(() => [
  { value: 'movie', label: t('library.movies'), icon: 'i-lucide-clapperboard', count: counts.value.movie },
  { value: 'series', label: t('library.series'), icon: 'i-lucide-tv', count: counts.value.series }
])

const stats = computed<LibraryStat[]>(() => [
  { key: 'movies', label: t('library.stats.movies'), value: libraryStats.value.movies, icon: 'i-lucide-clapperboard' },
  { key: 'series', label: t('library.stats.series'), value: libraryStats.value.series, icon: 'i-lucide-tv' },
  {
    key: 'episodes',
    label: t('library.stats.episodes'),
    value: libraryStats.value.episodes,
    icon: 'i-lucide-list-video'
  },
  { key: 'genres', label: t('library.stats.genres'), value: libraryStats.value.genres, icon: 'i-lucide-tags' }
])

const sortOptions = computed<LibrarySortOption[]>(() => [
  { value: 'added', label: t('library.sortAdded') },
  { value: 'title', label: t('library.sortTitle') },
  { value: 'year', label: t('library.sortYear') },
  { value: 'rating', label: t('library.sortRating') },
  { value: 'runtime', label: t('library.sortRuntime') }
])

const activeTypeItems = computed(() => items.value.filter((item) => item.type === activeType.value))
const visibleItems = computed(() =>
  sortLibraryItems(
    filterLibraryItems(items.value, activeType.value, query.value),
    sort.value,
    direction.value,
    locale.value
  )
)

const directionIcon = computed(() =>
  direction.value === 'asc' ? 'i-lucide-arrow-up-narrow-wide' : 'i-lucide-arrow-down-narrow-wide'
)
const directionLabel = computed(() => (direction.value === 'asc' ? t('library.ascending') : t('library.descending')))

const showOffline = computed(
  () => !loading.value && (loadFailed.value || (data.value !== null && data.value.configured && !data.value.connected))
)
const showUnconfigured = computed(
  () => !loading.value && !showOffline.value && data.value !== null && !data.value.configured
)
const showEmpty = computed(
  () =>
    !loading.value &&
    !showOffline.value &&
    !showUnconfigured.value &&
    data.value !== null &&
    data.value.connected &&
    items.value.length === 0
)
const showResultsMeta = computed(
  () => !loading.value && data.value !== null && data.value.connected && items.value.length > 0
)

const selected = ref<LibraryItem | null>(null)
const detailsOpen = ref(false)

function openDetails(item: LibraryItem) {
  selected.value = item
  detailsOpen.value = true
}

function onSortChange(value: unknown) {
  if (!isLibrarySortKey(value)) return
  sort.value = value
  direction.value = defaultLibraryDirection(value)
}

function toggleDirection() {
  direction.value = direction.value === 'asc' ? 'desc' : 'asc'
}

async function loadLibrary(force = false) {
  if (force) refreshing.value = true
  else loading.value = true

  try {
    data.value = await $fetch<LibraryResponse>('/api/library', {
      query: force ? { force: '1' } : undefined
    })
    loadFailed.value = false
  } catch (error) {
    if (data.value === null) loadFailed.value = true
    if (force) {
      toast.add({ title: t('common.error'), description: describeApiError(error, t).description, color: 'error' })
    }
  } finally {
    loading.value = false
    refreshing.value = false
  }
}

async function refreshLibrary() {
  if (refreshing.value) return
  await loadLibrary(true)
}

onMounted(() => {
  void loadLibrary()
})

// The toolbar pins below the mobile header and flush to the viewport on desktop.
// Measuring the header keeps the offset correct across breakpoints and locale
// changes instead of hard-coding the mobile header height.
const sentinelRef = ref<HTMLElement | null>(null)
const stuck = ref(false)
const mobileTop = ref(0)
const isMobileBar = computed(() => smallerThan('lg'))
const barTopStyle = computed(() =>
  isMobileBar.value && mobileTop.value > 0 ? { top: `${mobileTop.value}px` } : undefined
)
// Sentinel sits 24px above the bar plus its own 1px height.
const TOOLBAR_REST_GAP = 25
let observer: IntersectionObserver | null = null

function measureHeader() {
  const header = document.querySelector<HTMLElement>('[data-mobile-header]')
  mobileTop.value = header !== null ? header.getBoundingClientRect().bottom : 0
}

function createObserver() {
  observer?.disconnect()
  const sentinel = sentinelRef.value
  if (sentinel === null) return

  const offset = (isMobileBar.value ? mobileTop.value : 0) + TOOLBAR_REST_GAP
  observer = new IntersectionObserver(
    (entries) => {
      const entry = entries[0]
      stuck.value = entry !== undefined && !entry.isIntersecting
    },
    { rootMargin: `-${offset}px 0px 0px 0px`, threshold: 0 }
  )
  observer.observe(sentinel)
}

onMounted(() => {
  measureHeader()
  createObserver()
})

watch(isMobileBar, () => {
  measureHeader()
  createObserver()
})
watch(mobileTop, createObserver)

onUnmounted(() => {
  observer?.disconnect()
})
</script>
