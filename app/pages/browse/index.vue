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
      <div v-if="popularPending || trendingPending || topRatedPending" class="flex justify-center py-30">
        <UIcon name="i-lucide-loader-2" class="size-8 animate-spin text-amber-500" />
      </div>
      <template v-else>
        <section v-if="trendingItems.length > 0" class="mb-10">
          <h2 class="text-lg font-semibold text-zinc-900 dark:text-white">
            {{ t('browse.trending') }}
          </h2>
          <div class="group/carousel relative">
            <button
              class="absolute top-1/2 left-0 z-30 -translate-y-1/2 flex items-center justify-center rounded-full bg-white/90 p-1.5 shadow-md opacity-0 transition-opacity hover:bg-white group-hover/carousel:opacity-100 dark:bg-zinc-800/90 dark:hover:bg-zinc-800"
              @click="scrollCarousel(trendingCarouselRef, -1)"
            >
              <UIcon name="i-lucide-chevron-left" class="size-5 text-zinc-700 dark:text-zinc-300" />
            </button>
            <div ref="trendingCarouselRef" class="-mx-1 flex gap-4 overflow-x-auto px-1 py-4 pb-2 scrollbar-hide">
              <div
                v-for="item in trendingItems"
                :key="`trending-${item.type}-${item.id}`"
                class="w-36 flex-none sm:w-44 md:w-48 lg:w-52"
              >
                <MediaCard
                  :id="item.id"
                  :type="item.type"
                  :title="item.title"
                  :overview="item.overview"
                  :poster-url="item.posterUrl"
                  :year="item.year"
                  :rating="item.rating"
                  @click="goToItem(item)"
                />
              </div>
            </div>
            <button
              class="absolute top-1/2 right-0 z-30 -translate-y-1/2 flex items-center justify-center rounded-full bg-white/90 p-1.5 shadow-md opacity-0 transition-opacity hover:bg-white group-hover/carousel:opacity-100 dark:bg-zinc-800/90 dark:hover:bg-zinc-800"
              @click="scrollCarousel(trendingCarouselRef, 1)"
            >
              <UIcon name="i-lucide-chevron-right" class="size-5 text-zinc-700 dark:text-zinc-300" />
            </button>
          </div>
        </section>

        <section v-if="popularMovies.length > 0" class="mb-10">
          <h2 class="text-lg font-semibold text-zinc-900 dark:text-white">
            {{ t('browse.popularMovies') }}
          </h2>
          <div class="group/carousel relative">
            <button
              class="absolute top-1/2 left-0 z-30 -translate-y-1/2 flex items-center justify-center rounded-full bg-white/90 p-1.5 shadow-md opacity-0 transition-opacity hover:bg-white group-hover/carousel:opacity-100 dark:bg-zinc-800/90 dark:hover:bg-zinc-800"
              @click="scrollCarousel(movieCarouselRef, -1)"
            >
              <UIcon name="i-lucide-chevron-left" class="size-5 text-zinc-700 dark:text-zinc-300" />
            </button>
            <div ref="movieCarouselRef" class="-mx-1 flex gap-4 overflow-x-auto px-1 py-4 pb-2 scrollbar-hide">
              <div
                v-for="item in popularMovies"
                :key="`movie-${item.id}`"
                class="w-36 flex-none sm:w-44 md:w-48 lg:w-52"
              >
                <MediaCard
                  :id="item.id"
                  type="movie"
                  :title="item.title"
                  :overview="item.overview"
                  :poster-url="item.posterUrl"
                  :year="item.year"
                  :rating="item.rating"
                  @click="goToItem(item)"
                />
              </div>
            </div>
            <button
              class="absolute top-1/2 right-0 z-30 -translate-y-1/2 flex items-center justify-center rounded-full bg-white/90 p-1.5 shadow-md opacity-0 transition-opacity hover:bg-white group-hover/carousel:opacity-100 dark:bg-zinc-800/90 dark:hover:bg-zinc-800"
              @click="scrollCarousel(movieCarouselRef, 1)"
            >
              <UIcon name="i-lucide-chevron-right" class="size-5 text-zinc-700 dark:text-zinc-300" />
            </button>
          </div>
        </section>

        <section v-if="popularTvShows.length > 0" class="mb-10">
          <h2 class="text-lg font-semibold text-zinc-900 dark:text-white">
            {{ t('browse.popularTv') }}
          </h2>
          <div class="group/carousel relative">
            <button
              class="absolute top-1/2 left-0 z-30 -translate-y-1/2 flex items-center justify-center rounded-full bg-white/90 p-1.5 shadow-md opacity-0 transition-opacity hover:bg-white group-hover/carousel:opacity-100 dark:bg-zinc-800/90 dark:hover:bg-zinc-800"
              @click="scrollCarousel(tvCarouselRef, -1)"
            >
              <UIcon name="i-lucide-chevron-left" class="size-5 text-zinc-700 dark:text-zinc-300" />
            </button>
            <div ref="tvCarouselRef" class="-mx-1 flex gap-4 overflow-x-auto px-1 py-4 scrollbar-hide">
              <div v-for="item in popularTvShows" :key="`tv-${item.id}`" class="w-36 flex-none sm:w-44 md:w-48 lg:w-52">
                <MediaCard
                  :id="item.id"
                  type="tv"
                  :title="item.title"
                  :overview="item.overview"
                  :poster-url="item.posterUrl"
                  :year="item.year"
                  :rating="item.rating"
                  @click="goToItem(item)"
                />
              </div>
            </div>
            <button
              class="absolute top-1/2 right-0 z-30 -translate-y-1/2 flex items-center justify-center rounded-full bg-white/90 p-1.5 shadow-md opacity-0 transition-opacity hover:bg-white group-hover/carousel:opacity-100 dark:bg-zinc-800/90 dark:hover:bg-zinc-800"
              @click="scrollCarousel(tvCarouselRef, 1)"
            >
              <UIcon name="i-lucide-chevron-right" class="size-5 text-zinc-700 dark:text-zinc-300" />
            </button>
          </div>
        </section>

        <section v-if="topRatedMovies.length > 0" class="mb-10">
          <h2 class="text-lg font-semibold text-zinc-900 dark:text-white">
            {{ t('browse.topRated') }}
          </h2>
          <div class="group/carousel relative">
            <button
              class="absolute top-1/2 left-0 z-30 -translate-y-1/2 flex items-center justify-center rounded-full bg-white/90 p-1.5 shadow-md opacity-0 transition-opacity hover:bg-white group-hover/carousel:opacity-100 dark:bg-zinc-800/90 dark:hover:bg-zinc-800"
              @click="scrollCarousel(topRatedCarouselRef, -1)"
            >
              <UIcon name="i-lucide-chevron-left" class="size-5 text-zinc-700 dark:text-zinc-300" />
            </button>
            <div ref="topRatedCarouselRef" class="-mx-1 flex gap-4 overflow-x-auto px-1 py-4 pb-2 scrollbar-hide">
              <div
                v-for="item in topRatedMovies"
                :key="`toprated-${item.id}`"
                class="w-36 flex-none sm:w-44 md:w-48 lg:w-52"
              >
                <MediaCard
                  :id="item.id"
                  type="movie"
                  :title="item.title"
                  :overview="item.overview"
                  :poster-url="item.posterUrl"
                  :year="item.year"
                  :rating="item.rating"
                  @click="goToItem(item)"
                />
              </div>
            </div>
            <button
              class="absolute top-1/2 right-0 z-30 -translate-y-1/2 flex items-center justify-center rounded-full bg-white/90 p-1.5 shadow-md opacity-0 transition-opacity hover:bg-white group-hover/carousel:opacity-100 dark:bg-zinc-800/90 dark:hover:bg-zinc-800"
              @click="scrollCarousel(topRatedCarouselRef, 1)"
            >
              <UIcon name="i-lucide-chevron-right" class="size-5 text-zinc-700 dark:text-zinc-300" />
            </button>
          </div>
        </section>
      </template>
    </template>
  </div>
</template>

<script setup lang="ts">
const { t, locale } = useI18n()

const searchQuery = ref('')
const searchType = ref('all')
const lastQuery = ref('')
const searched = ref(false)

const movieCarouselRef = ref<HTMLElement | null>(null)
const tvCarouselRef = ref<HTMLElement | null>(null)
const trendingCarouselRef = ref<HTMLElement | null>(null)
const topRatedCarouselRef = ref<HTMLElement | null>(null)

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

const { data: trendingData, pending: trendingPending } = await useFetch('/api/browse/trending', {
  query: computed(() => ({ locale: locale.value })),
  watch: [locale]
})

const trendingItems = computed(() => trendingData.value?.items ?? [])

const { data: topRatedData, pending: topRatedPending } = await useFetch('/api/browse/top-rated', {
  query: computed(() => ({ locale: locale.value })),
  watch: [locale]
})

const topRatedMovies = computed(() => topRatedData.value?.movies ?? [])

function scrollCarousel(el: HTMLElement | null, direction: -1 | 1) {
  if (!el) return
  const scrollAmount = el.clientWidth * 0.75
  el.scrollBy({ left: direction * scrollAmount, behavior: 'smooth' })
}

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
</script>

<style scoped>
.scrollbar-hide {
  -ms-overflow-style: none;
  scrollbar-width: none;
}
.scrollbar-hide::-webkit-scrollbar {
  display: none;
}
</style>
