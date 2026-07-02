<script setup lang="ts">
import type { MediaCarouselItem } from '~/types/media'

const props = defineProps<{
  trendingItems: MediaCarouselItem[]
}>()

const { t, locale } = useI18n()
const { goToItem } = useGoToItem()

const heroCurrent = ref<MediaCarouselItem | null>(null)
const heroNext = ref<MediaCarouselItem | null>(null)
const heroOverview = ref<string>('')
const transitioning = ref(false)
const heroIntervalId = ref<ReturnType<typeof setInterval>>()
const currentZoomKey = ref(0)
const nextZoomKey = ref(0)
const textVisible = ref(true)

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
    setTimeout(() => {
      heroCurrent.value = heroNext.value
      heroNext.value = null
      currentZoomKey.value++
      textVisible.value = true
      transitioning.value = false
    }, 1400)
  }, 8000)
}

function initHero() {
  if (heroCurrent.value !== null || props.trendingItems.length === 0) return
  heroCurrent.value = props.trendingItems[Math.floor(Math.random() * props.trendingItems.length)] ?? null
  startHeroRotation()
}

watch(() => props.trendingItems, initHero)
onMounted(initHero)

watch(
  () => props.trendingItems,
  (items) => {
    if (!heroCurrent.value || items.length === 0) return
    const matched = items.find((i) => i.id === heroCurrent.value!.id && i.type === heroCurrent.value!.type)
    if (matched) {
      heroCurrent.value = matched
    }
  }
)

watch(
  [heroCurrent, locale],
  async ([item]) => {
    if (!item) return
    try {
      const endpoint = item.type === 'movie' ? `/api/browse/movie/${item.id}` : `/api/browse/tv/${item.id}`
      const data = await $fetch<{ movie?: { overview: string }; show?: { overview: string } }>(endpoint, {
        query: { locale }
      })
      heroOverview.value = (data.movie ?? data.show)?.overview ?? item.overview
    } catch {
      heroOverview.value = item.overview
    }
  },
  { immediate: true }
)

useHead(() => {
  const img = heroCurrent.value?.backdropUrl ?? heroCurrent.value?.posterUrl
  if (!img) return {}
  return { link: [{ rel: 'preload', as: 'image', href: img }] }
})

onUnmounted(() => {
  if (heroIntervalId.value) clearInterval(heroIntervalId.value)
})
</script>

<template>
  <div
    v-if="heroCurrent"
    class="relative mb-8 overflow-hidden rounded-2xl h-95 sm:h-120 md:h-140 lg:h-160 xl:h-180 hero-entrance"
  >
    <!-- Current image -->
    <img
      :key="`current-${currentZoomKey}`"
      :src="heroCurrent.backdropUrl || heroCurrent.posterUrl"
      :alt="heroCurrent.title"
      loading="eager"
      class="absolute inset-0 w-full h-full object-cover hero-zoom-current"
    />
    <!-- Next image (fading in) -->
    <img
      v-if="heroNext && transitioning"
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
          v-if="heroCurrent.logoUrl"
          :src="heroCurrent.logoUrl"
          :alt="heroCurrent.title"
          class="max-h-16 sm:max-h-20 md:max-h-24 mb-3 object-contain drop-shadow-lg"
        />
        <h2 v-else class="text-2xl sm:text-3xl md:text-4xl font-bold text-white mb-2">
          {{ heroCurrent.title }}
          <span v-if="heroCurrent.year" class="text-lg sm:text-xl font-normal text-white/60 ml-2">{{
            heroCurrent.year
          }}</span>
        </h2>
        <div class="flex items-center gap-2 mb-2">
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
        <p class="text-sm sm:text-base text-white/70 line-clamp-2 sm:line-clamp-3 mb-4">
          {{ heroOverview || heroCurrent.overview }}
        </p>
        <UButton
          :label="t('dashboard.heroCTA')"
          icon="i-lucide-play"
          size="lg"
          class="cursor-pointer"
          @click="goToItem(heroCurrent)"
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
