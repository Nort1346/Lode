<script setup lang="ts">
import type { MediaCarouselItem, MediaItemType } from '~/types/media'

const props = withDefaults(
  defineProps<{
    trendingItems?: MediaCarouselItem[]
    tmdbId?: number | null
    tmdbType?: MediaItemType
    customLogoUrl?: string
    customBackgroundUrl?: string
    customTitle?: string
    customDescription?: string
  }>(),
  {
    trendingItems: () => [],
    tmdbId: null,
    tmdbType: 'movie',
    customLogoUrl: '',
    customBackgroundUrl: '',
    customTitle: '',
    customDescription: ''
  }
)

const { t, locale } = useI18n()
const { goToItem } = useGoToItem()

const heroCurrent = ref<MediaCarouselItem | null>(null)
const heroNext = ref<MediaCarouselItem | null>(null)
const heroOverview = ref<string>('')
const transitioning = ref(false)
const heroIntervalId = ref<ReturnType<typeof setInterval>>()
const heroRotationTimeout = ref<ReturnType<typeof setTimeout>>()
const currentZoomKey = ref(0)
const nextZoomKey = ref(0)
const textVisible = ref(true)

// ── Display resolution: custom props always take precedence over fetched data ──
function firstValue(...values: Array<string | null | undefined>): string {
  for (const value of values) {
    if (value !== null && value !== undefined && value !== '') return value
  }
  return ''
}

const displayLogo = computed(() => firstValue(props.customLogoUrl, heroCurrent.value?.logoUrl))
const displayBackground = computed(() =>
  firstValue(props.customBackgroundUrl, heroCurrent.value?.backdropUrl, heroCurrent.value?.posterUrl)
)
const displayTitle = computed(() => firstValue(props.customTitle, heroCurrent.value?.title))
const displayDescription = computed(() =>
  firstValue(props.customDescription, heroOverview.value, heroCurrent.value?.overview)
)
const heroVisible = computed(
  () =>
    heroCurrent.value !== null ||
    props.customTitle !== '' ||
    props.customDescription !== '' ||
    props.customLogoUrl !== '' ||
    props.customBackgroundUrl !== ''
)
const navigable = computed(() => heroCurrent.value !== null)

// ── Single-item TMDB mode (tmdbId) ──
let singleRequestId = 0

async function fetchTmdbItem(id: number, type: MediaItemType): Promise<MediaCarouselItem | null> {
  const endpoint = type === 'movie' ? `/api/browse/movie/${id}` : `/api/browse/tv/${id}`
  const data = await $fetch<{ movie?: Record<string, unknown>; show?: Record<string, unknown> }>(endpoint, {
    query: { locale: locale.value }
  })
  const item = data.movie ?? data.show
  if (!item) return null
  return {
    id: item.id as number,
    type,
    title: (item.title ?? item.name ?? '') as string,
    overview: (item.overview ?? '') as string,
    posterUrl: (item.posterUrl ?? null) as string | null,
    backdropUrl: (item.backdropUrl ?? null) as string | null,
    logoUrl: null,
    year: ((item.releaseDate ?? item.firstAirDate ?? '') as string).slice(0, 4),
    rating: (item.rating ?? 0) as number,
    inLibrary: false
  }
}

function stopHeroRotation() {
  if (heroIntervalId.value) {
    clearInterval(heroIntervalId.value)
    heroIntervalId.value = undefined
  }
  if (heroRotationTimeout.value) {
    clearTimeout(heroRotationTimeout.value)
    heroRotationTimeout.value = undefined
  }
}

function loadSingleItem() {
  if (props.tmdbId === null) return
  // Single mode takes over: stop rotation and any in-flight transition
  stopHeroRotation()
  heroNext.value = null
  transitioning.value = false
  textVisible.value = true
  const rid = ++singleRequestId
  fetchTmdbItem(props.tmdbId, props.tmdbType)
    .then((item) => {
      if (rid === singleRequestId) heroCurrent.value = item
    })
    .catch(() => {
      if (rid === singleRequestId) heroCurrent.value = null
    })
}

// Re-fetch when the id, type or locale changes so all hero text re-localizes live
watch([() => props.tmdbId, () => props.tmdbType, () => locale.value], () => {
  loadSingleItem()
})

function startHeroRotation() {
  heroIntervalId.value = setInterval(() => {
    if (props.trendingItems.length === 0) return
    const currentIdx = props.trendingItems.findIndex(
      (i) => i.id === heroCurrent.value?.id && i.type === heroCurrent.value?.type
    )
    const nextIdx = (currentIdx + 1) % props.trendingItems.length
    heroNext.value = props.trendingItems[nextIdx] ?? null
    transitioning.value = true
    textVisible.value = false
    nextZoomKey.value++
    heroRotationTimeout.value = setTimeout(() => {
      heroCurrent.value = heroNext.value
      heroNext.value = null
      currentZoomKey.value++
      textVisible.value = true
      transitioning.value = false
    }, 1400)
  }, 8000)
}

async function initHero() {
  if (heroCurrent.value !== null) return

  if (props.tmdbId !== null) {
    loadSingleItem()
    return
  }

  if (props.trendingItems.length === 0) return
  heroCurrent.value = props.trendingItems[Math.floor(Math.random() * props.trendingItems.length)] ?? null
  startHeroRotation()
}

watch(() => props.trendingItems, initHero)
onMounted(initHero)

// Swap in the localized trending item when the source list refreshes (e.g. locale change)
watch(
  () => props.trendingItems,
  (items) => {
    if (props.tmdbId !== null) return
    const current = heroCurrent.value
    if (!current || items.length === 0) return
    const matched = items.find((i) => i.id === current.id && i.type === current.type)
    if (matched) {
      heroCurrent.value = matched
    }
  }
)

// Only the latest rotation/locale may write the overview - the hero swaps items every 8s
let overviewRequestId = 0

watch(
  [heroCurrent, () => locale.value],
  async ([item]) => {
    if (!item) return
    // Single TMDB mode: the item fetch already provides a localized overview
    if (props.tmdbId !== null) return
    if (props.customDescription !== '') return
    // Clear stale-locale text while the localized overview loads
    heroOverview.value = ''
    const id = ++overviewRequestId
    try {
      const endpoint = item.type === 'movie' ? `/api/browse/movie/${item.id}` : `/api/browse/tv/${item.id}`
      const data = await $fetch<{ movie?: { overview: string }; show?: { overview: string } }>(endpoint, {
        query: { locale: locale.value }
      })
      if (id !== overviewRequestId) return
      heroOverview.value = (data.movie ?? data.show)?.overview ?? item.overview
    } catch {
      if (id !== overviewRequestId) return
      heroOverview.value = item.overview
    }
  },
  { immediate: true }
)

useHead(() => {
  const img = displayBackground.value
  if (img === '') return {}
  return { link: [{ rel: 'preload', as: 'image', href: img }] }
})

function handleHeroClick() {
  if (heroCurrent.value) goToItem(heroCurrent.value)
}

onUnmounted(() => {
  stopHeroRotation()
})
</script>

<template>
  <div
    v-if="heroVisible"
    class="relative mb-8 overflow-hidden rounded-2xl h-95 sm:h-120 md:h-140 lg:h-160 xl:h-180 hero-entrance"
    :class="navigable ? 'cursor-pointer' : ''"
    @click="handleHeroClick"
  >
    <!-- Current image (static when a custom background is provided) -->
    <img
      v-if="displayBackground"
      :key="`current-${currentZoomKey}`"
      :src="displayBackground"
      :alt="displayTitle"
      loading="eager"
      class="absolute inset-0 w-full h-full object-cover"
      :class="customBackgroundUrl ? '' : 'hero-zoom-current'"
    />
    <!-- Next image (fading in) -->
    <img
      v-if="heroNext && transitioning && !customBackgroundUrl"
      :key="`next-${nextZoomKey}`"
      :src="heroNext.backdropUrl || heroNext.posterUrl"
      :alt="heroNext.title"
      class="absolute inset-0 w-full h-full object-cover hero-zoom-next"
    />
    <div class="absolute inset-0 bg-linear-to-t from-black/90 via-black/40 to-transparent" />
    <div class="absolute inset-0 bg-linear-to-r from-black/60 to-transparent" />

    <div
      class="absolute inset-0 flex items-end p-6 sm:p-8 md:p-10 hero-text"
      :class="textVisible ? 'hero-text-visible' : 'hero-text-hidden'"
    >
      <div class="max-w-xl">
        <img
          v-if="displayLogo"
          :src="displayLogo"
          :alt="displayTitle"
          class="max-h-16 sm:max-h-20 md:max-h-24 mb-3 object-contain drop-shadow-lg"
        />
        <h2 v-else-if="displayTitle" class="text-2xl sm:text-3xl md:text-4xl font-bold text-white mb-2">
          {{ displayTitle }}
          <span v-if="heroCurrent?.year" class="text-lg sm:text-xl font-normal text-white/60 ml-2">
            {{ heroCurrent.year }}
          </span>
        </h2>
        <div v-if="heroCurrent" class="flex items-center gap-2 mb-2">
          <span
            class="flex items-center rounded-md px-2 py-0.5 text-xs font-semibold backdrop-blur-sm"
            :class="heroCurrent.type === 'movie' ? 'bg-blue-500/80 text-white' : 'bg-purple-500/80 text-white'"
          >
            {{ heroCurrent.type === 'movie' ? t('mediaCard.movie') : t('mediaCard.tv') }}
          </span>
          <span
            v-if="heroCurrent.rating > 0"
            class="flex items-center gap-1 rounded-md bg-amber-500/90 px-2 py-0.5 text-xs font-bold text-black backdrop-blur-sm"
          >
            <UIcon name="i-lucide-star" class="size-3" />
            {{ heroCurrent.rating.toFixed(1) }}
          </span>
        </div>
        <p v-if="displayDescription" class="text-sm sm:text-base text-white/70 line-clamp-2 sm:line-clamp-3 mb-4">
          {{ displayDescription }}
        </p>
        <UButton
          v-if="navigable"
          :label="t('dashboard.heroCTA')"
          icon="i-lucide-play"
          size="lg"
          class="font-bold"
          @click.stop="handleHeroClick"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.hero-entrance {
  animation: hero-fade-in 0.6s ease-out;
}

@keyframes hero-fade-in {
  from {
    opacity: 0;
    transform: translateY(20px) scale(0.98);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

.hero-zoom-current {
  animation: hero-zoom-slow 8s linear forwards;
  transform-origin: center center;
}
.hero-zoom-next {
  animation: hero-zoom-fade-in 1.4s ease-out forwards;
  transform-origin: center center;
}
.hero-text {
  transition:
    opacity 0.6s ease-in-out,
    transform 0.6s ease-in-out;
}
.hero-text-visible {
  opacity: 1;
  transform: translateY(0);
}
.hero-text-hidden {
  opacity: 0;
  transform: translateY(12px);
}

@keyframes hero-zoom-slow {
  0% {
    transform: scale(1);
  }
  100% {
    transform: scale(1.08);
  }
}

@keyframes hero-zoom-fade-in {
  0% {
    opacity: 0;
    transform: scale(1.08);
  }
  40% {
    opacity: 1;
  }
  100% {
    opacity: 1;
    transform: scale(1);
  }
}
</style>
