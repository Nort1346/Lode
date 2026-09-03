<template>
  <div>
    <div class="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
      <div class="relative flex-1 overflow-visible" data-autocomplete>
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
        <div
          v-if="isOpen && suggestions.length > 0 && isMobile"
          class="absolute top-full left-0 right-0 z-50 mt-1 rounded-lg border border-zinc-200 bg-white shadow-lg dark:border-zinc-700 dark:bg-zinc-800"
        >
          <button
            v-for="item in suggestions"
            :key="`${item.type}-${item.id}`"
            class="flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-700"
            @click="selectSuggestion(item)"
          >
            <img v-if="item.posterUrl" :src="item.posterUrl" :alt="item.title" class="h-10 w-7 rounded object-cover" />
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
      </div>
      <USelect v-model="searchParams.type" :items="typeOptions" size="xl" class="w-full sm:w-40" />
    </div>

    <div class="mb-6 flex flex-wrap gap-1.5">
      <UButton
        v-for="g in filteredGenres"
        :key="`chip-${g.id}`"
        :label="t(g.label)"
        :variant="searchParams.genres.includes(g.id) ? 'solid' : 'outline'"
        size="xs"
        @click="toggleGenre(g.id)"
      />
    </div>

    <div
      v-if="searchPending || discoverPending"
      class="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6"
    >
      <div v-for="n in 12" :key="`search-skeleton-${n}`">
        <USkeleton class="aspect-2/3 w-full rounded-xl" />
        <USkeleton class="mt-2 h-4 w-3/4 rounded" />
        <USkeleton class="mt-1 h-3 w-1/2 rounded" />
      </div>
    </div>

    <TransitionGroup
      v-else-if="results.length > 0"
      name="card-list"
      tag="div"
      class="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6"
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
        @click="goToItem(item)"
      />
    </TransitionGroup>

    <div v-else-if="hasActiveSearch" class="py-20 text-center text-zinc-500 dark:text-zinc-400">
      {{ t('browse.noResults') }}
    </div>

    <template v-else>
      <div v-reveal>
        <MediaCarousel
          :title="t('browse.trending')"
          :items="trendingItems"
          :loading="trendingPending"
          @item-click="goToItem"
        />
      </div>
      <div v-reveal="1">
        <MediaCarousel
          :title="t('browse.popularMovies')"
          :items="popularMoviesTyped"
          :loading="popularPending"
          @item-click="goToItem"
        />
      </div>

      <InviewSection @visible="popularTvVisible = true">
        <MediaCarousel
          :title="t('browse.popularTv')"
          :items="popularTvShowsTyped"
          :loading="popularPending"
          @item-click="goToItem"
        />
      </InviewSection>

      <div v-reveal>
        <BrowseSpotlight v-if="spotlights[0]" :item="spotlights[0]" />
      </div>

      <InviewSection v-for="g in movieGenres" :key="`movie-${g.id}`" @visible="genreVisible[`movie-${g.id}`] = true">
        <MediaCarousel
          :title="t(g.key)"
          :items="genreMovieItems[g.id] ?? []"
          :loading="genreMoviePending[g.id]"
          @item-click="goToItem"
        />
      </InviewSection>

      <div v-reveal>
        <BrowseSpotlight v-if="spotlights[1]" :item="spotlights[1]" />
      </div>

      <InviewSection v-for="g in tvGenres" :key="`tv-${g.id}`" @visible="genreVisible[`tv-${g.id}`] = true">
        <MediaCarousel
          :title="t(g.key)"
          :items="genreTvItems[g.id] ?? []"
          :loading="genreTvPending[g.id]"
          @item-click="goToItem"
        />
      </InviewSection>

      <div v-reveal>
        <BrowseSpotlight v-if="spotlights[2]" :item="spotlights[2]" />
      </div>

      <InviewSection @visible="topRatedVisible = true">
        <MediaCarousel
          :title="t('browse.topRated')"
          :items="topRatedMoviesTyped"
          :loading="topRatedPending"
          @item-click="goToItem"
        />
      </InviewSection>
    </template>
  </div>
</template>

<script setup lang="ts">
import type { MediaCarouselItem } from '~/types/media'
import type { AutocompleteSuggestion } from '~/types/autocomplete'
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
const { suggestions, isOpen, isMobile, close } = useAutocomplete(
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

const hasActiveSearch = computed(() => searchParams.q.length >= 2 || searchParams.genres.length > 0)

const debouncedQ = ref('')
let debounceTimer: ReturnType<typeof setTimeout> | null = null

watch(
  () => searchParams.q,
  (val) => {
    if (debounceTimer !== null) clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => {
      debouncedQ.value = val
    }, 500)
  }
)

const {
  data: searchData,
  pending: searchPending,
  execute: executeSearch
} = useFetch('/api/browse/search', {
  query: computed(() => ({
    q: debouncedQ.value,
    type: searchParams.type,
    ...buildGenreParams(),
    locale: locale.value
  })),
  watch: [debouncedQ, () => searchParams.type, () => searchParams.genres, locale],
  immediate: false
})

const {
  data: discoverData,
  pending: discoverPending,
  execute: executeDiscover
} = useFetch('/api/browse/discover', {
  query: computed(() => ({
    ...buildGenreParams(),
    type: searchParams.type,
    locale: locale.value
  })),
  watch: false,
  immediate: false
})

const isSearching = computed(() => searchParams.q.length >= 2)
const results = computed(() => {
  if (isSearching.value) return searchData.value?.results ?? []
  if (searchParams.genres.length > 0) return discoverData.value?.results ?? []
  return []
})

watch([debouncedQ, () => searchParams.type, () => searchParams.genres, locale], () => {
  if (searchParams.genres.length === 0 && searchParams.q.length < 2) return
  if (isSearching.value) {
    void executeSearch()
  } else if (searchParams.genres.length > 0) {
    void executeDiscover()
  }
})

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

onMounted(() => {
  if (hasActiveSearch.value) {
    if (isSearching.value) {
      void executeSearch()
    } else if (searchParams.genres.length > 0) {
      void executeDiscover()
    }
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

const { data: spotlightsData } = await useFetch('/api/browse/spotlights', {
  query: computed(() => ({ locale: locale.value })),
  watch: [locale]
})
const spotlights = computed(() => spotlightsData.value?.items ?? [])

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
