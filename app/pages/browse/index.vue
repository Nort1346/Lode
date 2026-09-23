<template>
  <div>
    <div ref="sentinelRef" class="h-px" aria-hidden="true" />

    <!-- Pinned while scrolling: flush at the viewport top on desktop (top-0)
         with CONSTANT top padding so the bar height never changes (no scroll
         jump when it pins/unpins); the frosted background/border only appear
         once stuck. Under the app header on mobile (measured offset). Phones
         collapse to a compact search row + Filters toggle; tablets keep row. -->
    <div
      class="sticky z-30 -mx-4 border-b border-transparent px-4 pt-5 transition-[background-color,border-color] duration-200 motion-reduce:transition-none lg:-mx-6 lg:top-0 lg:mb-3 lg:px-6 lg:pb-3"
      :class="stuck ? 'border-zinc-200/70 bg-white/80 backdrop-blur-md dark:border-white/8 dark:bg-zinc-900/80' : ''"
      :style="barTopStyle"
    >
      <div class="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div class="flex min-w-0 flex-1 gap-3">
          <div class="relative min-w-0 flex-1 overflow-visible" data-autocomplete>
            <UInput
              v-model="searchParams.q"
              :placeholder="t('browse.searchPlaceholder')"
              icon="i-lucide-search"
              size="xl"
              class="w-full"
              @focus="suggestions.length > 0 && (isOpen = true)"
              @keydown.escape="isOpen = false"
              @keydown.enter="close"
            />
            <Transition name="suggestions-fade">
              <div
                v-if="isOpen && suggestions.length > 0"
                class="absolute top-full left-0 right-0 z-50 mt-1 rounded-lg border border-zinc-200 bg-white shadow-lg dark:border-zinc-700 dark:bg-zinc-800"
              >
                <button
                  v-for="item in suggestions"
                  :key="`${item.type}-${item.id}`"
                  class="flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-700"
                  @click="selectSuggestion(item)"
                >
                  <img
                    v-if="item.posterUrl"
                    :src="item.posterUrl"
                    :alt="item.title"
                    class="h-10 w-7 rounded object-cover"
                  />
                  <div v-else class="h-10 w-7 rounded bg-zinc-200 dark:bg-zinc-700" />
                  <div class="min-w-0 flex-1">
                    <AutocompleteItemTitle :text="item.title" />
                    <p class="text-xs text-zinc-500 dark:text-zinc-400">
                      {{ item.type === 'movie' ? t('browse.searchMovies') : t('browse.searchTv') }}
                      <span v-if="item.year"> · {{ item.year }}</span>
                    </p>
                  </div>
                </button>
              </div>
            </Transition>
          </div>
          <Transition name="filters-fade">
            <button
              v-if="compactStuck"
              type="button"
              class="flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 text-sm font-medium text-zinc-700 transition-colors duration-150 hover:bg-zinc-100 motion-reduce:transition-none dark:border-white/10 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-white/5"
              :aria-expanded="filterOpen"
              :aria-label="t('browse.filters')"
              @click="filterOpen = !filterOpen"
            >
              <UIcon name="i-lucide-sliders-horizontal" class="size-4" />
              {{ t('browse.filters') }}
              <span
                v-if="searchParams.genres.length > 0"
                class="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-500 px-1 text-[9px] font-bold text-white"
              >
                {{ searchParams.genres.length }}
              </span>
            </button>
          </Transition>
        </div>
        <USelect v-model="searchParams.type" :items="typeOptions" size="xl" class="hidden w-40 sm:block" />
      </div>

      <!-- Collapsible on phones while pinned (grid rows 0fr -> 1fr); the phone-only
           type selector lives here so it reappears with the filter panel -->
      <div class="filter-panel" :class="panelExpanded ? 'filter-panel-open' : ''">
        <div class="min-h-0 overflow-hidden">
          <div class="flex flex-col gap-3 pb-6 lg:pb-0">
            <USelect v-model="searchParams.type" :items="typeOptions" size="xl" class="w-full sm:hidden" />
            <div class="flex flex-wrap gap-1.5">
              <UButton
                v-for="g in filteredGenres"
                :key="`chip-${g.id}`"
                :label="t(g.label)"
                :variant="searchParams.genres.includes(g.id) ? 'solid' : 'outline'"
                size="xs"
                @click="toggleGenre(g.id)"
              />
            </div>
          </div>
        </div>
      </div>
    </div>

    <Transition name="search-fade" mode="out-in">
      <div v-if="showSkeletons" key="search-skeletons">
        <BrowseSearchStatus />
        <div class="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          <div v-for="n in 12" :key="`search-skeleton-${n}`">
            <USkeleton class="aspect-2/3 w-full rounded-xl" />
            <USkeleton class="mt-2 h-4 w-3/4 rounded" />
            <USkeleton class="mt-1 h-3 w-1/2 rounded" />
          </div>
        </div>
      </div>

      <div v-else-if="results.length > 0" key="search-results" class="relative">
        <TransitionGroup
          name="card-list"
          tag="div"
          class="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 transition-opacity duration-200"
          :class="dimmed ? 'opacity-50' : 'opacity-100'"
        >
          <MediaCard
            v-for="item in results"
            :id="item.id"
            :key="`${item.type}-${item.id}`"
            :type="item.type"
            :title="item.title"
            :overview="item.overview"
            :poster-url="item.posterUrl"
            :year="item.year"
            :rating="item.rating"
            :in-library="item.inLibrary"
            :genres="genreLabelsFor(item.type, item.genres)"
            @click="goToItem(item)"
          />
        </TransitionGroup>
        <Transition name="search-fade">
          <div
            v-if="searchPhase === 'loading' || searchPhase === 'error'"
            class="pointer-events-none absolute top-1 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-white/90 px-2.5 py-1 shadow-sm backdrop-blur-sm dark:bg-zinc-800/90"
          >
            <UIcon
              v-if="searchPhase === 'loading'"
              name="i-lucide-loader-2"
              class="size-3.5 animate-spin text-zinc-500 dark:text-zinc-400"
            />
            <template v-else>
              <UIcon name="i-lucide-alert-circle" class="size-3.5 text-red-500" />
              <span class="text-xs font-medium text-red-600 dark:text-red-400">{{ t('browse.searchError') }}</span>
            </template>
          </div>
        </Transition>
      </div>

      <div
        v-else-if="searchPhase === 'empty'"
        key="search-empty"
        class="py-20 text-center text-zinc-500 dark:text-zinc-400"
      >
        <p class="text-sm sm:text-base">
          {{
            searchParams.q.trim() ? t(emptyStateKey, { query: searchParams.q.trim() }) : t('browse.noResultsGeneric')
          }}
        </p>
        <p class="mt-2 text-xs text-zinc-400 dark:text-zinc-500">{{ t('browse.noResultsHint') }}</p>
      </div>

      <div
        v-else-if="searchPhase === 'error'"
        key="search-error"
        class="py-20 text-center text-zinc-500 dark:text-zinc-400"
      >
        {{ t('browse.searchError') }}
      </div>

      <div v-else-if="searchPhase === 'idle'" key="browse-default">
        <div v-reveal>
          <MediaCarousel
            :title="t('browse.trending')"
            :items="filteredTrending"
            :loading="trendingPending"
            @item-click="goToItem"
          />
        </div>
        <div v-if="!isTvOnly" v-reveal="1">
          <MediaCarousel
            :title="t('browse.popularMovies')"
            :items="popularMoviesTyped"
            :loading="popularPending"
            @item-click="goToItem"
          />
        </div>

        <InviewSection v-if="!isMovieOnly" @visible="popularTvVisible = true">
          <MediaCarousel
            :title="t('browse.popularTv')"
            :items="popularTvShowsTyped"
            :loading="popularPending"
            @item-click="goToItem"
          />
        </InviewSection>

        <div v-reveal>
          <BrowseSpotlight v-if="visibleSpotlights[0]" :item="visibleSpotlights[0]" />
        </div>

        <InviewSection
          v-for="g in visibleMovieGenres"
          :key="`movie-${g.id}`"
          @visible="genreVisible[`movie-${g.id}`] = true"
        >
          <MediaCarousel
            :title="t(g.key)"
            :items="genreMovieItems[g.id] ?? []"
            :loading="genreMoviePending[g.id]"
            @item-click="goToItem"
          />
        </InviewSection>

        <div v-reveal>
          <BrowseSpotlight v-if="searchParams.type === 'all' && visibleSpotlights[1]" :item="visibleSpotlights[1]" />
        </div>

        <InviewSection v-for="g in visibleTvGenres" :key="`tv-${g.id}`" @visible="genreVisible[`tv-${g.id}`] = true">
          <MediaCarousel
            :title="t(g.key)"
            :items="genreTvItems[g.id] ?? []"
            :loading="genreTvPending[g.id]"
            @item-click="goToItem"
          />
        </InviewSection>

        <div v-reveal>
          <BrowseSpotlight v-if="visibleSpotlights[2]" :item="visibleSpotlights[2]" />
        </div>

        <InviewSection v-if="!isTvOnly" @visible="topRatedVisible = true">
          <MediaCarousel
            :title="t('browse.topRated')"
            :items="topRatedMoviesTyped"
            :loading="topRatedPending"
            @item-click="goToItem"
          />
        </InviewSection>
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import type { MediaCarouselItem } from '~/types/media'
import type { AutocompleteSuggestion } from '~/types/autocomplete'
import type { SearchResultItem } from '~/types/browse'
import { useGoToItem } from '~/composables/useNavigate'

const { t, locale } = useI18n()
const { goToItem } = useGoToItem()
const route = useRoute()
const router = useRouter()

const searchParams = reactive({
  q: '',
  type: 'all',
  genres: [] as number[]
})

const localeRef = toRef(locale)
const typeRef = toRef(() => searchParams.type)
const { suggestions, isOpen, close } = useAutocomplete(
  toRef(() => searchParams.q),
  typeRef,
  localeRef
)

function selectSuggestion(item: AutocompleteSuggestion) {
  close()
  goToItem({ id: item.id, type: item.type })
}

function handleClickOutside(e: MouseEvent) {
  const target = e.target as HTMLElement
  if (!target.closest('[data-autocomplete]')) {
    close()
  }
}

onMounted(() => {
  document.addEventListener('click', handleClickOutside)
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
})

// Sticky control bar: flush at the viewport top on desktop (top-0) with
// CONSTANT top padding (bar height never changes, so no scroll jump when it
// pins/unpins); pinned under the app header on mobile (measured offset). A
// 1px sentinel sits above the bar in normal flow; the
// IntersectionObserver's rootMargin shrinks the viewport top to the sticky
// line so "stuck" fires exactly when the bar pins.
const { width, smallerThan } = useBreakpoints()
const isMobileBar = computed(() => smallerThan('lg'))
const isPhoneBar = computed(() => smallerThan('sm'))
const sentinelRef = ref<HTMLElement | null>(null)
const stuck = ref(false)
const filterOpen = ref(false)
const mobileTop = ref(0)
let observer: IntersectionObserver | null = null

const compactStuck = computed(() => isPhoneBar.value && stuck.value)
const panelExpanded = computed(() => !compactStuck.value || filterOpen.value)
const barTopStyle = computed(() =>
  isMobileBar.value && mobileTop.value > 0 ? { top: `${mobileTop.value}px` } : undefined
)

function measureHeader() {
  const header = document.querySelector<HTMLElement>('[data-mobile-header]')
  mobileTop.value = header ? header.getBoundingClientRect().bottom : 0
}

function createObserver() {
  observer?.disconnect()
  const sentinel = sentinelRef.value
  if (sentinel === null) return
  const offset = isMobileBar.value ? mobileTop.value : 0
  observer = new IntersectionObserver(
    (entries) => {
      const entry = entries[0]
      stuck.value = entry !== undefined && entry.isIntersecting === false
    },
    { rootMargin: `-${offset}px 0px 0px 0px`, threshold: 0 }
  )
  observer.observe(sentinel)
}

onMounted(() => {
  measureHeader()
  createObserver()
})

watch(width, measureHeader)
watch([isMobileBar, mobileTop], createObserver)
watch(compactStuck, (v) => {
  if (!v) filterOpen.value = false
})

onUnmounted(() => {
  observer?.disconnect()
})

const typeOptions = computed(() => [
  { label: t('browse.searchAll'), value: 'all' },
  { label: t('browse.searchMovies'), value: 'movie' },
  { label: t('browse.searchTv'), value: 'tv' }
])

const allGenres = [
  { id: 1, label: 'browse.action', movieId: 28, tvId: 10759 },
  { id: 2, label: 'browse.adventure', movieId: 12, tvId: 10759 },
  { id: 3, label: 'browse.animation', movieId: 16, tvId: 16 },
  { id: 4, label: 'browse.comedy', movieId: 35, tvId: 35 },
  { id: 5, label: 'browse.crime', movieId: 80, tvId: 80 },
  { id: 6, label: 'browse.documentary', movieId: 99, tvId: 99 },
  { id: 7, label: 'browse.drama', movieId: 18, tvId: 18 },
  { id: 8, label: 'browse.family', movieId: 10751, tvId: 10751 },
  { id: 9, label: 'browse.fantasy', movieId: 14, tvId: 10765 },
  { id: 10, label: 'browse.history', movieId: 36, tvId: null },
  { id: 11, label: 'browse.horror', movieId: 27, tvId: null },
  { id: 12, label: 'browse.kids', movieId: null, tvId: 10762 },
  { id: 13, label: 'browse.music', movieId: 10402, tvId: null },
  { id: 14, label: 'browse.mystery', movieId: 9648, tvId: 9648 },
  { id: 15, label: 'browse.reality', movieId: null, tvId: 10764 },
  { id: 16, label: 'browse.romance', movieId: 10749, tvId: null },
  { id: 17, label: 'browse.scifi', movieId: 878, tvId: 10765 },
  { id: 18, label: 'browse.thriller', movieId: 53, tvId: null },
  { id: 19, label: 'browse.war', movieId: 10752, tvId: 10768 },
  { id: 20, label: 'browse.western', movieId: 37, tvId: 37 }
]

const filteredGenres = computed(() => {
  if (searchParams.type === 'movie') return allGenres.filter((g) => g.movieId !== null)
  if (searchParams.type === 'tv') return allGenres.filter((g) => g.tvId !== null)
  return allGenres
})

function toggleGenre(id: number) {
  const idx = searchParams.genres.indexOf(id)
  if (idx >= 0) {
    searchParams.genres.splice(idx, 1)
  } else {
    searchParams.genres.push(id)
  }
}

// Maps raw TMDB genre IDs from search results to localized chip labels
function genreLabelsFor(type: 'movie' | 'tv', genreIds: string[]): string[] {
  const labels: string[] = []
  for (const gid of genreIds) {
    const g = allGenres.find((x) => (type === 'movie' ? x.movieId : x.tvId) === Number(gid))
    if (g) labels.push(t(g.label))
  }
  return labels
}

function buildGenreParams() {
  const movieIds: string[] = []
  const tvIds: string[] = []
  for (const genreId of searchParams.genres) {
    const g = allGenres.find((x) => x.id === genreId)
    if (!g) continue
    if (searchParams.type !== 'tv' && g.movieId !== null) movieIds.push(String(g.movieId))
    if (searchParams.type !== 'movie' && g.tvId !== null) tvIds.push(String(g.tvId))
  }
  return { movieGenre: movieIds.join(','), tvGenre: tvIds.join(',') }
}

watch(
  () => route.query,
  (q) => {
    searchParams.q = (q.q as string) ?? ''
    searchParams.type = (q.type as string) ?? 'all'
    searchParams.genres =
      typeof q.genres === 'string'
        ? q.genres
            .split(',')
            .map(Number)
            .filter((n) => !Number.isNaN(n) && n > 0)
        : []
  },
  { immediate: true }
)

watch(
  () => searchParams.type,
  () => {
    searchParams.genres = searchParams.genres.filter((id) => {
      const g = allGenres.find((x) => x.id === id)
      if (!g) return false
      if (searchParams.type === 'movie') return g.movieId !== null
      if (searchParams.type === 'tv') return g.tvId !== null
      return true
    })
  }
)

watch(
  searchParams,
  () => {
    const q: Record<string, string> = {}
    if (searchParams.q) q.q = searchParams.q
    if (searchParams.type !== 'all') q.type = searchParams.type
    if (searchParams.genres.length > 0) q.genres = searchParams.genres.join(',')
    void router.replace({ query: q })
  },
  { deep: true }
)

function fetchResults(signal: AbortSignal): Promise<SearchResultItem[]> {
  const genreParams = buildGenreParams()
  if (searchParams.q.trim().length >= 2) {
    return $fetch<{ results: SearchResultItem[] }>('/api/browse/search', {
      query: {
        q: searchParams.q.trim(),
        type: searchParams.type,
        ...genreParams,
        locale: locale.value
      },
      signal
    }).then((data) => data.results)
  }
  return $fetch<{ results: SearchResultItem[] }>('/api/browse/discover', {
    query: { ...genreParams, type: searchParams.type, locale: locale.value },
    signal
  }).then((data) => data.results)
}

const {
  phase: searchPhase,
  results,
  showSkeletons,
  dimmed
} = useBrowseSearch({
  q: () => searchParams.q,
  type: () => searchParams.type,
  genres: () => searchParams.genres,
  locale: () => locale.value,
  fetchResults
})

const emptyStateKeys = ['browse.noResults1', 'browse.noResults2', 'browse.noResults3', 'browse.noResults4']
const emptyStateKey = ref('browse.noResults1')

watch(searchPhase, (phase) => {
  if (phase === 'empty') {
    emptyStateKey.value = emptyStateKeys[Math.floor(Math.random() * emptyStateKeys.length)] ?? 'browse.noResults1'
  }
})

const popularTvVisible = ref(false)
const topRatedVisible = ref(false)
const genreVisible = reactive<Record<string, boolean>>({})

const { data: popularData, pending: popularPending } = await useFetch('/api/browse/popular', {
  query: computed(() => ({ locale: locale.value })),
  watch: [locale]
})

const popularMovies = computed(() => popularData.value?.movies ?? [])
const popularTvShows = computed(() => popularData.value?.tv ?? [])

const popularMoviesTyped = computed(
  () =>
    popularMovies.value.map((m: Record<string, unknown>) => ({
      ...m,
      type: 'movie' as const,
      logoUrl: null
    })) as MediaCarouselItem[]
)
const popularTvShowsTyped = computed(
  () =>
    popularTvShows.value.map((m: Record<string, unknown>) => ({
      ...m,
      type: 'tv' as const,
      logoUrl: null
    })) as MediaCarouselItem[]
)

const { data: trendingData, pending: trendingPending } = await useFetch('/api/browse/trending', {
  query: computed(() => ({ locale: locale.value })),
  watch: [locale]
})

const trendingItems = computed(() => trendingData.value?.items ?? [])

const isMovieOnly = computed(() => searchParams.type === 'movie')
const isTvOnly = computed(() => searchParams.type === 'tv')

const filteredTrending = computed(() =>
  searchParams.type === 'all' ? trendingItems.value : trendingItems.value.filter((i) => i.type === searchParams.type)
)

const { data: spotlightsData } = await useFetch('/api/browse/spotlights', {
  query: computed(() => ({ locale: locale.value })),
  watch: [locale]
})
const spotlights = computed(() => spotlightsData.value?.items ?? [])

const visibleSpotlights = computed(() =>
  searchParams.type === 'all' ? spotlights.value : spotlights.value.filter((s) => s.type === searchParams.type)
)

const { data: topRatedData, pending: topRatedPending } = await useFetch('/api/browse/top-rated', {
  query: computed(() => ({ locale: locale.value })),
  immediate: false,
  watch: [locale, topRatedVisible]
})

const topRatedMovies = computed(() => topRatedData.value?.movies ?? [])

const topRatedMoviesTyped = computed(
  () =>
    topRatedMovies.value.map((m: Record<string, unknown>) => ({
      ...m,
      type: 'movie' as const,
      logoUrl: null
    })) as MediaCarouselItem[]
)

const movieGenres = [
  { id: 28, key: 'browse.action' },
  { id: 12, key: 'browse.adventure' },
  { id: 35, key: 'browse.comedy' },
  { id: 18, key: 'browse.drama' },
  { id: 878, key: 'browse.scifi' },
  { id: 27, key: 'browse.horror' },
  { id: 53, key: 'browse.thriller' },
  { id: 16, key: 'browse.animation' }
]

const tvGenres = [
  { id: 10759, key: 'browse.action' },
  { id: 35, key: 'browse.comedy' },
  { id: 18, key: 'browse.drama' },
  { id: 10765, key: 'browse.scifi' },
  { id: 80, key: 'browse.crime' },
  { id: 10762, key: 'browse.animation' }
]

const visibleMovieGenres = computed(() => (isTvOnly.value ? [] : movieGenres))
const visibleTvGenres = computed(() => (isMovieOnly.value ? [] : tvGenres))

const genreMovieItems = reactive<Record<number, MediaCarouselItem[]>>({})
const genreMoviePending = reactive<Record<number, boolean>>({})
const genreTvItems = reactive<Record<number, MediaCarouselItem[]>>({})
const genreTvPending = reactive<Record<number, boolean>>({})

for (const g of movieGenres) {
  watch(
    () => genreVisible[`movie-${g.id}`],
    (visible) => {
      if (visible !== true) return
      const { data: d, pending: p } = useFetch('/api/browse/genre', {
        query: computed(() => ({ genreId: g.id, mediaType: 'movie', locale: locale.value })),
        watch: [locale]
      })
      watchEffect(() => {
        genreMoviePending[g.id] = p.value
        if (d.value?.items) {
          genreMovieItems[g.id] = d.value.items as MediaCarouselItem[]
        }
      })
    },
    { once: true }
  )
}

for (const g of tvGenres) {
  watch(
    () => genreVisible[`tv-${g.id}`],
    (visible) => {
      if (visible !== true) return
      const { data: d, pending: p } = useFetch('/api/browse/genre', {
        query: computed(() => ({ genreId: g.id, mediaType: 'tv', locale: locale.value })),
        watch: [locale]
      })
      watchEffect(() => {
        genreTvPending[g.id] = p.value
        if (d.value?.items) {
          genreTvItems[g.id] = d.value.items as MediaCarouselItem[]
        }
      })
    },
    { once: true }
  )
}
</script>

<style scoped>
/* Filter panel collapse: animating grid rows (0fr -> 1fr) avoids measuring
   content height; degrades to an instant toggle where unsupported */
.filter-panel {
  display: grid;
  grid-template-rows: 0fr;
  transition: grid-template-rows 0.25s ease;
}

.filter-panel-open {
  grid-template-rows: 1fr;
}

.filter-panel > div {
  min-height: 0;
  overflow: hidden;
  opacity: 0;
  transition: opacity 0.2s ease;
}

.filter-panel-open > div {
  opacity: 1;
}

/* Mobile "Filters" toggle: fades and settles as the compact bar pins/unpins */
.filters-fade-enter-active,
.filters-fade-leave-active {
  transition:
    opacity 0.2s ease,
    transform 0.2s ease;
}

.filters-fade-enter-from,
.filters-fade-leave-to {
  opacity: 0;
  transform: scale(0.95);
}

/* Mobile autocomplete dropdown: fades in slightly from above */
.suggestions-fade-enter-active,
.suggestions-fade-leave-active {
  transition:
    opacity 0.15s ease,
    transform 0.15s ease;
}

.suggestions-fade-enter-from,
.suggestions-fade-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

@media (prefers-reduced-motion: reduce) {
  .filter-panel,
  .filter-panel > div,
  .filters-fade-enter-active,
  .filters-fade-leave-active,
  .suggestions-fade-enter-active,
  .suggestions-fade-leave-active {
    transition: none;
  }
}
</style>
