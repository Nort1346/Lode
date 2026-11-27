<template>
  <UModal v-model:open="open" :title="item?.title" class="max-w-2xl">
    <template #body>
      <div v-if="item" class="space-y-5">
        <div class="flex gap-4">
          <div
            class="relative aspect-2/3 w-24 shrink-0 overflow-hidden rounded-xl border border-zinc-200/80 bg-zinc-100 shadow-sm dark:border-white/10 dark:bg-zinc-800"
          >
            <img
              v-if="item.posterUrl !== null"
              :src="item.posterUrl"
              :alt="item.title"
              class="h-full w-full object-cover"
            />
            <div v-else class="flex h-full w-full items-center justify-center text-zinc-400 dark:text-zinc-600">
              <UIcon name="i-lucide-film" class="size-7" />
            </div>
          </div>

          <div class="min-w-0 flex-1 space-y-3">
            <div class="flex flex-wrap items-center gap-1.5">
              <span
                class="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold"
                :class="
                  item.type === 'movie'
                    ? 'bg-blue-500/12 text-blue-700 dark:text-blue-300'
                    : 'bg-purple-500/12 text-purple-700 dark:text-purple-300'
                "
              >
                <UIcon :name="item.type === 'movie' ? 'i-lucide-clapperboard' : 'i-lucide-tv'" class="size-3" />
                {{ item.type === 'movie' ? t('library.movies') : t('library.series') }}
              </span>
              <span
                v-if="item.rating !== null"
                class="inline-flex items-center gap-1 rounded-md bg-amber-500/15 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:text-amber-300"
              >
                <UIcon name="i-lucide-star" class="size-3" />
                {{ item.rating.toFixed(1) }}
              </span>
              <span
                v-if="item.officialRating !== null"
                class="rounded-md border border-zinc-200 px-2 py-0.5 text-[11px] font-medium text-zinc-600 dark:border-white/10 dark:text-zinc-400"
              >
                {{ item.officialRating }}
              </span>
              <span v-if="item.year !== null" class="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                {{ item.year }}
              </span>
            </div>

            <p v-if="item.originalTitle !== null" class="text-sm text-zinc-500 dark:text-zinc-400">
              {{ t('common.originalWithName', { name: item.originalTitle }) }}
            </p>

            <div class="space-y-1 text-sm text-zinc-600 dark:text-zinc-300">
              <p v-if="item.type === 'movie' && item.runtimeMinutes !== null">
                {{ t('library.runtime', { count: item.runtimeMinutes }) }}
              </p>
              <template v-if="item.type === 'series'">
                <p v-if="item.seasonCount !== null">{{ t('library.seasons', { count: item.seasonCount }) }}</p>
                <p v-if="item.episodeCount !== null">{{ t('library.episodes', { count: item.episodeCount }) }}</p>
              </template>
            </div>
          </div>
        </div>

        <div v-if="item.genres.length > 0" class="flex flex-wrap gap-1.5">
          <span
            v-for="genre in item.genres"
            :key="genre"
            class="rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-xs font-medium text-zinc-600 dark:border-white/10 dark:bg-white/5 dark:text-zinc-300"
          >
            {{ genre }}
          </span>
        </div>

        <div>
          <h3 class="text-[11px] font-semibold tracking-[0.14em] text-zinc-500 uppercase dark:text-zinc-400">
            {{ t('library.overview') }}
          </h3>
          <p class="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">
            {{ item.overview.length > 0 ? item.overview : t('library.noOverview') }}
          </p>
        </div>
      </div>
    </template>

    <template #footer>
      <div class="flex w-full justify-end">
        <UButton color="neutral" variant="soft" :label="t('library.close')" @click="open = false" />
      </div>
    </template>
  </UModal>
</template>

<script setup lang="ts">
import type { LibraryItem } from '#shared/library'

const { t } = useI18n()

defineProps<{
  item: LibraryItem | null
}>()

const open = defineModel<boolean>('open', { default: false })
</script>
