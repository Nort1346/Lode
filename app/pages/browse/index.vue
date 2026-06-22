<template>
  <div>
    <div class="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center">
      <UInput
        v-model="searchQuery"
        :placeholder="t('browse.searchPlaceholder')"
        icon="i-lucide-search"
        size="xl"
        class="flex-1"
        autofocus
        @keyup.enter="doSearch"
      />
      <USelect v-model="searchType" :items="typeOptions" size="xl" class="w-full sm:w-40" />
    </div>

    <div v-if="pending" class="flex justify-center py-20">
      <UIcon name="i-lucide-loader-2" class="size-8 animate-spin text-amber-500" />
    </div>

    <div v-else-if="error" class="rounded-xl bg-red-500/10 p-6 text-center text-red-500 dark:text-red-400">
      {{ t('browse.error') }}
    </div>

    <div
      v-else-if="results.length > 0"
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
        @click="goToItem(item)"
      />
    </div>

    <div v-else-if="searched" class="py-20 text-center text-zinc-500 dark:text-zinc-400">
      {{ t('browse.noResults') }} "{{ lastQuery }}"
    </div>

    <template v-else>
      <!-- Eagerly loaded -->
      <MediaCarousel
        :title="t('browse.trending')"
        :items="trendingItems"
        :loading="trendingPending"
        @item-click="goToItem"
      />
      <MediaCarousel
        :title="t('browse.popularMovies')"
        :items="popularMoviesTyped"
        :loading="popularPending"
        @item-click="goToItem"
      />

      <!-- Lazy: Popular TV -->
      <InviewSection @visible="popularTvVisible = true">
        <MediaCarousel
          :title="t('browse.popularTv')"
          :items="popularTvShowsTyped"
          :loading="popularPending"
          @item-click="goToItem"
        />
      </InviewSection>

      <!-- Lazy: Movie genres -->
      <InviewSection v-for="g in movieGenres" :key="`movie-${g.id}`" @visible="genreVisible[`movie-${g.id}`] = true">
        <MediaCarousel
          :title="t(g.key)"
          :items="genreMovieItems[g.id] ?? []"
          :loading="genreMoviePending[g.id]"
          @item-click="goToItem"
        />
      </InviewSection>

      <!-- Lazy: TV genres -->
      <InviewSection v-for="g in tvGenres" :key="`tv-${g.id}`" @visible="genreVisible[`tv-${g.id}`] = true">
        <MediaCarousel
          :title="t(g.key)"
          :items="genreTvItems[g.id] ?? []"
          :loading="genreTvPending[g.id]"
          @item-click="goToItem"
        />
      </InviewSection>

      <!-- Lazy: Top Rated -->
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
import type { MediaCarouselItem } from '~/components/MediaCarousel.vue'

const { t, locale } = useI18n()

const searchQuery = ref('')
const searchType = ref('all')
const lastQuery = ref('')
const searched = ref(false)

const typeOptions = computed(() => [
  { label: t('browse.searchAll'), value: 'all' },
  { label: t('browse.searchMovies'), value: 'movie' },
  { label: t('browse.searchTv'), value: 'tv' }
])

const { data, pending, error, execute } = await useFetch('/api/browse/search', {
  query: computed(() => ({
    q: lastQuery.value,
    type: searchType.value,
    locale: locale.value
  })),
  immediate: false,
  watch: [locale]
})

const results = computed(() => data.value?.results ?? [])

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

const { data: topRatedData, pending: topRatedPending } = await useFetch('/api/browse/top-rated', {
  query: computed(() => ({ locale: locale.value })),
  immediate: false,
  watch: [locale]
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

async function doSearch() {
  const q = searchQuery.value.trim()
  if (q.length < 2) return
  lastQuery.value = q
  searched.value = true
  await execute()
}

function goToItem(item: { id: number; type: string }) {
  if (item.type === 'movie') {
    navigateTo(`/browse/movie/${item.id}`)
  } else {
    navigateTo(`/browse/tv/${item.id}`)
  }
}

// Lazy visibility flags
const popularTvVisible = ref(false)
const topRatedVisible = ref(false)
const genreVisible = reactive<Record<string, boolean>>({})

// Genre definitions
const movieGenres = [
  { id: 28, key: 'browse.actionMovies' },
  { id: 12, key: 'browse.adventureMovies' },
  { id: 35, key: 'browse.comedyMovies' },
  { id: 18, key: 'browse.dramaMovies' },
  { id: 878, key: 'browse.scifiMovies' },
  { id: 27, key: 'browse.horrorMovies' },
  { id: 53, key: 'browse.thrillerMovies' },
  { id: 16, key: 'browse.animatedMovies' }
]

const tvGenres = [
  { id: 10759, key: 'browse.actionTv' },
  { id: 35, key: 'browse.comedyTv' },
  { id: 18, key: 'browse.dramaTv' },
  { id: 10765, key: 'browse.scifiTv' },
  { id: 80, key: 'browse.crimeTv' },
  { id: 10762, key: 'browse.animatedTv' }
]

// Genre data stores
const genreMovieItems = reactive<Record<number, MediaCarouselItem[]>>({})
const genreMoviePending = reactive<Record<number, boolean>>({})
const genreTvItems = reactive<Record<number, MediaCarouselItem[]>>({})
const genreTvPending = reactive<Record<number, boolean>>({})

// Watchers for lazy genre fetching
for (const g of movieGenres) {
  watch(
    () => genreVisible[`movie-${g.id}`],
    (visible) => {
      if (!visible) return
      const { data: d, pending: p } = useFetch('/api/browse/genre', {
        query: computed(() => ({ genreId: g.id, mediaType: 'movie', locale: locale.value })),
        watch: [locale]
      })
      watchEffect(() => {
        genreMoviePending[g.id] = p.value
        if (d.value?.items) {
          genreMovieItems[g.id] = d.value.items.map((m: Record<string, unknown>) => ({
            ...m,
            type: 'movie' as const,
            logoUrl: null
          })) as MediaCarouselItem[]
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
      if (!visible) return
      const { data: d, pending: p } = useFetch('/api/browse/genre', {
        query: computed(() => ({ genreId: g.id, mediaType: 'tv', locale: locale.value })),
        watch: [locale]
      })
      watchEffect(() => {
        genreTvPending[g.id] = p.value
        if (d.value?.items) {
          genreTvItems[g.id] = d.value.items.map((m: Record<string, unknown>) => ({
            ...m,
            type: 'tv' as const,
            logoUrl: null
          })) as MediaCarouselItem[]
        }
      })
    },
    { once: true }
  )
}
</script>
