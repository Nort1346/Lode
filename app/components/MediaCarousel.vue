<template>
  <section v-if="loading || items.length > 0" class="mb-10">
    <h2 class="text-lg font-semibold text-zinc-900 dark:text-white mb-1">
      {{ title }}
    </h2>

    <div v-if="loading" class="flex gap-4 overflow-hidden py-4">
      <div v-for="n in 6" :key="`skeleton-${n}`" class="w-36 flex-none sm:w-44 md:w-48 lg:w-52">
        <div class="animate-pulse">
          <div class="aspect-2/3 rounded-xl bg-zinc-200 dark:bg-white/10" />
          <div class="mt-2 h-4 w-3/4 rounded bg-zinc-200 dark:bg-white/10" />
          <div class="mt-1 h-3 w-1/2 rounded bg-zinc-200 dark:bg-white/10" />
        </div>
      </div>
    </div>

    <div v-else class="group/carousel relative">
      <button
        class="absolute top-1/2 left-0 z-30 -translate-y-1/2 flex items-center justify-center rounded-full bg-white/90 p-1.5 shadow-md opacity-0 transition-opacity hover:bg-white group-hover/carousel:opacity-100 dark:bg-zinc-800/90 dark:hover:bg-zinc-800"
        @click="scroll(-1)"
      >
        <UIcon name="i-lucide-chevron-left" class="size-5 text-zinc-700 dark:text-zinc-300" />
      </button>

      <div ref="scrollRef" class="-mx-1 flex gap-4 overflow-x-auto px-1 py-4 pb-2 scrollbar-hide">
        <div v-for="item in items" :key="`${item.type}-${item.id}`" class="w-36 flex-none sm:w-44 md:w-48 lg:w-52">
          <MediaCard
            :id="item.id"
            :type="item.type"
            :title="item.title"
            :overview="item.overview"
            :poster-url="item.posterUrl"
            :year="item.year"
            :rating="item.rating"
            @click="$emit('itemClick', item)"
          />
        </div>
      </div>

      <button
        class="absolute top-1/2 right-0 z-30 -translate-y-1/2 flex items-center justify-center rounded-full bg-white/90 p-1.5 shadow-md opacity-0 transition-opacity hover:bg-white group-hover/carousel:opacity-100 dark:bg-zinc-800/90 dark:hover:bg-zinc-800"
        @click="scroll(1)"
      >
        <UIcon name="i-lucide-chevron-right" class="size-5 text-zinc-700 dark:text-zinc-300" />
      </button>
    </div>
  </section>
</template>

<script setup lang="ts">
import type { MediaCarouselItem } from '~/types/media'

defineProps<{
  title: string
  items: MediaCarouselItem[]
  loading?: boolean
}>()

defineEmits<{
  itemClick: [item: MediaCarouselItem]
}>()

const scrollRef = ref<HTMLElement | null>(null)

function scroll(direction: -1 | 1) {
  const el = scrollRef.value
  if (!el) return
  const amount = el.clientWidth * 0.75
  el.scrollBy({ left: direction * amount, behavior: 'smooth' })
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
