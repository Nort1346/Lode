<template>
  <div
    class="flex flex-col gap-3 rounded-xl border border-indigo-400 bg-white/50 p-4 dark:border-indigo-500/30 dark:bg-indigo-500/5 sm:flex-row sm:items-center sm:justify-between"
  >
    <div class="min-w-0 flex-1">
      <span class="flex items-center gap-2 text-xs font-bold text-indigo-500">
        <UIcon name="i-lucide-list-video" class="size-3" />
        {{ t('tv.episodePack') }}
        <span
          class="font-bold"
          :class="
            pack.percentage >= 80 ? 'text-emerald-500' : pack.percentage >= 60 ? 'text-amber-500' : 'text-zinc-500'
          "
        >
          {{ pack.percentage }}%
        </span>
        <UIcon v-if="pack.recommended" name="i-lucide-star" class="size-3 text-amber-500" />
      </span>
      <p class="mt-1 text-xs text-indigo-600 dark:text-indigo-300">
        {{
          t('tv.episodePackRange', {
            seasons: seasonRangeLabel(pack.seasons),
            episodes: seasonRangeLabel(pack.seasonEpisodes)
          })
        }}
      </p>
      <BrowseTorrentTitle class="mt-1" :text="pack.title" />
      <BrowseReleaseTags :tags="pack.tags" :resolution="pack.resolution" class="mt-1" />
      <div class="mt-1 flex items-center gap-3 text-xs text-zinc-500 dark:text-zinc-400">
        <span>{{ pack.sizeFormatted }}</span>
        <span class="flex items-center gap-1 text-emerald-500">
          <UIcon name="i-lucide-arrow-up" class="size-3" />
          {{ pack.seeders }}
        </span>
        <span>{{ pack.indexer }}</span>
      </div>
    </div>
    <UButton
      :color="limitExceeded ? 'error' : 'warning'"
      icon="i-lucide-download"
      size="sm"
      :loading="loading"
      :disabled="disabled || limitExceeded"
      class="font-bold"
      @click="$emit('download')"
    >
      {{ limitExceeded ? t('tv.limitReached') : t('tv.downloadEpisodePack') }}
    </UButton>
  </div>
</template>

<script setup lang="ts">
import type { EpisodePack } from '~/types/media'
import { seasonRangeLabel } from '~/utils/season-label'

defineProps<{
  pack: EpisodePack
  loading: boolean
  disabled: boolean
  limitExceeded: boolean
}>()

defineEmits<{
  download: []
}>()

const { t } = useI18n()
</script>
