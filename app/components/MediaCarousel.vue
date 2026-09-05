<template>
  <section v-if="loading || items.length > 0" class="mb-5">
    <h2 class="text-lg font-semibold text-zinc-900 dark:text-white mb-1">
      {{ title }}
    </h2>

    <div v-if="loading" class="flex overflow-hidden py-4 pb-8">
      <div
        v-for="n in 6"
        :key="`skeleton-${n}`"
        class="w-[calc(100%/2.1)] flex-none pr-4 snap-start sm:w-[calc(100%/3.1)] md:w-[calc(100%/4.1)] xl:w-[calc(100%/5.1)] 2xl:w-[calc(100%/7.1)]"
      >
        <USkeleton class="aspect-2/3 w-full rounded-xl" />
        <USkeleton class="mt-2 h-4 w-3/4 rounded" />
        <USkeleton class="mt-1 h-3 w-1/2 rounded" />
      </div>
    </div>

    <div v-else class="group/carousel relative">
      <button
        v-if="hasOverflow && !isAtStart"
        :aria-label="t('common.scrollLeft')"
        class="absolute top-1/2 left-0 z-30 -translate-y-1/2 flex items-center justify-center rounded-full bg-white/90 p-2 shadow-md opacity-0 transition-opacity hover:bg-white group-hover/carousel:opacity-100 dark:bg-zinc-800/90 dark:hover:bg-zinc-800"
        @click="scroll(-1)"
      >
        <UIcon name="i-lucide-chevron-left" class="size-6 text-zinc-700 dark:text-zinc-300" />
      </button>

      <div
        ref="scrollRef"
        class="-mx-1 flex snap-x snap-mandatory scroll-px-1 overflow-x-auto overflow-y-hidden px-1 py-4 pb-8 scrollbar-hide"
      >
        <div
          v-for="item in items"
          :key="`${item.type}-${item.id}`"
          class="w-[calc(100%/2.1)] flex-none pr-4 snap-start sm:w-[calc(100%/3.1)] md:w-[calc(100%/4.1)] xl:w-[calc(100%/5.1)] 2xl:w-[calc(100%/7.1)]"
        >
          <MediaCard
            :id="item.id"
            :type="item.type"
            :title="item.title"
            :overview="item.overview"
            :poster-url="item.posterUrl"
            :year="item.year"
            :rating="item.rating"
            :in-library="item.inLibrary"
            @click="$emit('itemClick', item)"
          />
        </div>
      </div>

      <button
        v-if="hasOverflow && !isAtEnd"
        :aria-label="t('common.scrollRight')"
        class="absolute top-1/2 right-0 z-30 -translate-y-1/2 flex items-center justify-center rounded-full bg-white/90 p-2 shadow-md opacity-0 transition-opacity hover:bg-white group-hover/carousel:opacity-100 dark:bg-zinc-800/90 dark:hover:bg-zinc-800"
        @click="scroll(1)"
      >
        <UIcon name="i-lucide-chevron-right" class="size-6 text-zinc-700 dark:text-zinc-300" />
      </button>
    </div>
  </section>
</template>

<script setup lang="ts">
import type { MediaCarouselItem } from '~/types/media'

const { t } = useI18n()

const props = defineProps<{
  title: string
  items: MediaCarouselItem[]
  loading?: boolean
}>()

defineEmits<{
  itemClick: [item: MediaCarouselItem]
}>()

const scrollRef = ref<HTMLElement | null>(null)
const { hasOverflow, isAtStart, isAtEnd, scroll } = useCarouselOverflow(scrollRef, {
  watchSource: () => props.items
})
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
