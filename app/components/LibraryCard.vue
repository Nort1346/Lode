<template>
  <article class="group">
    <button type="button" class="block w-full cursor-pointer text-left" @click="$emit('select', item)">
      <div
        class="relative aspect-2/3 overflow-hidden rounded-2xl border border-zinc-200/80 bg-zinc-100 shadow-sm transition-[transform,box-shadow,border-color] duration-300 ease-out group-hover:-translate-y-1 group-hover:border-zinc-300 group-hover:shadow-xl group-hover:shadow-zinc-900/10 group-focus-visible:ring-2 group-focus-visible:ring-amber-500 group-focus-visible:ring-offset-2 group-focus-visible:ring-offset-white motion-reduce:transition-none motion-reduce:group-hover:translate-y-0 dark:border-white/8 dark:bg-zinc-800 dark:group-hover:border-white/15 dark:group-hover:shadow-black/40 dark:group-focus-visible:ring-offset-zinc-900"
      >
        <img
          v-if="showPoster"
          :src="item.posterUrl ?? undefined"
          :alt="item.title"
          class="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.04] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
          loading="lazy"
          decoding="async"
          @error="posterFailed = true"
        />
        <div
          v-else
          class="flex h-full w-full flex-col items-center justify-center gap-2 bg-linear-to-br from-zinc-200 via-zinc-100 to-zinc-200 text-zinc-400 dark:from-zinc-800 dark:via-zinc-800/80 dark:to-zinc-900 dark:text-zinc-600"
        >
          <UIcon name="i-lucide-film" class="size-9" />
          <span class="px-3 text-center text-[11px] font-medium text-zinc-500 dark:text-zinc-500">
            {{ item.title }}
          </span>
        </div>

        <div
          class="pointer-events-none absolute inset-0 bg-linear-to-t from-black/75 via-black/0 to-black/0 opacity-90 transition-opacity duration-300 sm:opacity-0 sm:group-hover:opacity-100"
        />

        <span
          v-if="item.rating !== null"
          class="absolute top-2 right-2 flex items-center gap-1 rounded-md bg-amber-500/95 px-2 py-0.5 text-xs font-bold text-black shadow-sm backdrop-blur-sm"
        >
          <UIcon name="i-lucide-star" class="size-3" />
          {{ item.rating.toFixed(1) }}
        </span>

        <div
          class="pointer-events-none absolute inset-x-0 bottom-0 hidden translate-y-1 p-3 opacity-0 transition-[opacity,transform] duration-300 group-hover:translate-y-0 group-hover:opacity-100 sm:block"
        >
          <div v-if="topGenres.length > 0" class="flex flex-wrap gap-1">
            <span
              v-for="genre in topGenres"
              :key="genre"
              class="rounded-md bg-white/20 px-1.5 py-0.5 text-[10px] font-medium text-white/95 backdrop-blur-sm"
            >
              {{ genre }}
            </span>
          </div>
          <p v-else-if="item.overview.length > 0" class="line-clamp-2 text-xs leading-snug text-white/90">
            {{ item.overview }}
          </p>
        </div>
      </div>

      <div class="mt-2.5 px-0.5">
        <h3 class="line-clamp-1 text-sm font-semibold text-zinc-900 dark:text-white">
          {{ item.title }}
        </h3>
        <p class="mt-0.5 line-clamp-1 text-xs text-zinc-500 dark:text-zinc-400">
          {{ metaLine }}
        </p>
      </div>
    </button>
  </article>
</template>

<script setup lang="ts">
import type { LibraryItem } from '#shared/library'

const { t } = useI18n()

const props = defineProps<{
  item: LibraryItem
}>()

defineEmits<{
  select: [item: LibraryItem]
}>()

const posterFailed = ref(false)
const showPoster = computed(() => props.item.posterUrl !== null && !posterFailed.value)
const topGenres = computed(() => props.item.genres.slice(0, 3))

const metaLine = computed(() => {
  const parts: string[] = []
  if (props.item.year !== null) parts.push(String(props.item.year))
  if (props.item.type === 'movie' && props.item.runtimeMinutes !== null) {
    parts.push(t('library.minutes', { count: props.item.runtimeMinutes }))
  }
  if (props.item.type === 'series' && props.item.episodeCount !== null) {
    parts.push(t('library.episodeShort', { count: props.item.episodeCount }))
  }
  if (parts.length === 0) parts.push(t(props.item.type === 'movie' ? 'library.movies' : 'library.series'))
  return parts.join(' · ')
})
</script>
