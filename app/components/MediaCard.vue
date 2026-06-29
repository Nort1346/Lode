<template>
  <div
    ref="cardRef"
    class="media-card group relative cursor-pointer overflow-hidden rounded-xl transition-transform duration-200 ease-out"
    @mousemove="handleMouseMove"
    @mouseleave="handleMouseLeave"
    @click="$emit('click')"
  >
    <div class="poster-wrapper relative aspect-2/3 overflow-hidden rounded-xl">
      <img
        v-if="posterUrl"
        :src="posterUrl"
        :alt="title"
        class="h-full w-full object-cover transition-transform duration-300 group-hover:scale-110"
        loading="lazy"
      />
      <div v-else class="flex h-full w-full items-center justify-center bg-zinc-800">
        <UIcon name="i-lucide-film" class="size-12 text-zinc-600" />
      </div>

      <div
        class="absolute inset-0 bg-linear-to-t from-black/80 via-transparent to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100"
      />

      <div
        v-if="rating > 0"
        class="absolute top-2 right-2 flex items-center gap-1 rounded-md bg-amber-500/90 px-2 py-0.5 text-xs font-bold text-black backdrop-blur-sm"
      >
        <UIcon name="i-lucide-star" class="size-3" />
        {{ rating.toFixed(1) }}
      </div>

      <span
        class="absolute top-2 left-2 flex items-center rounded-md px-2 py-0.5 text-xs font-semibold backdrop-blur-sm"
        :class="type === 'movie' ? 'bg-blue-500/80 text-white' : 'bg-purple-500/80 text-white'"
      >
        {{ type === 'movie' ? t('mediaCard.movie') : t('mediaCard.tv') }}
      </span>

      <InLibraryBadge
        v-if="inLibrary"
        class="absolute bottom-2 left-2 right-2 justify-center opacity-100 transition-opacity duration-200 group-hover:opacity-0"
      />

      <div
        class="absolute right-0 bottom-0 left-0 p-3 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
      >
        <p class="line-clamp-2 text-sm text-white">{{ overview }}</p>
      </div>
    </div>

    <div class="mt-2 px-1">
      <h3 class="line-clamp-1 text-sm font-semibold text-zinc-900 dark:text-white">{{ title }}</h3>
      <p v-if="year" class="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">{{ year }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
const { t } = useI18n()

defineProps<{
  id: number
  type: 'movie' | 'tv'
  title: string
  overview: string
  posterUrl: string | null
  year: string
  rating: number
  inLibrary: boolean
}>()

defineEmits<{
  click: []
}>()

const cardRef = ref<HTMLElement | null>(null)

function handleMouseMove(e: MouseEvent) {
  const card = cardRef.value
  if (card === null) return

  const rect = card.getBoundingClientRect()
  const x = e.clientX - rect.left
  const y = e.clientY - rect.top
  const centerX = rect.width / 2
  const centerY = rect.height / 2

  const rotateX = ((y - centerY) / centerY) * -8
  const rotateY = ((x - centerX) / centerX) * 8

  card.style.transform = `perspective(800px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale3d(1.05, 1.05, 1.05)`
}

function handleMouseLeave() {
  const card = cardRef.value
  if (card === null) return
  card.style.transform = 'perspective(800px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)'
}
</script>

<style scoped>
.media-card {
  transform-style: preserve-3d;
  will-change: transform;
  z-index: 0;
  transition:
    transform 0.2s ease-out,
    z-index 0s;
}
.media-card:hover {
  z-index: 20;
}
</style>
