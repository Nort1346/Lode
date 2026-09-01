<template>
  <div class="rounded-xl border border-zinc-200 bg-white/50 p-4 dark:border-zinc-700 dark:bg-zinc-800/50">
    <div class="flex gap-4">
      <div v-if="episode.stillUrl" class="hidden w-32 shrink-0 lg:block">
        <img :src="episode.stillUrl" :alt="episode.name" class="w-full rounded-lg object-cover" loading="lazy" />
      </div>
      <div class="min-w-0 flex-1">
        <div class="flex items-center gap-2">
          <span class="text-sm font-bold text-amber-500">E{{ String(episode.episodeNumber).padStart(2, '0') }}</span>
          <span v-if="episode.rating > 0" class="hidden items-center gap-1 text-xs text-amber-500 md:flex">
            <UIcon name="i-lucide-star" class="size-3" />
            {{ episode.rating.toFixed(1) }}
          </span>
          <span v-if="episode.runtime" class="text-xs text-zinc-500 dark:text-zinc-400"
            >{{ episode.runtime }} {{ t('common.min') }}</span
          >
        </div>
        <h3 class="mt-1 font-semibold text-zinc-900 dark:text-white">{{ episode.name }}</h3>
        <p class="mt-1 line-clamp-2 text-sm text-zinc-600 dark:text-zinc-400">{{ episode.overview }}</p>

        <div v-if="episode.torrents.length > 0" class="mt-3 space-y-2 torrent-list">
          <BrowseTorrentRow
            v-for="(tr, tIdx) in episode.torrents.slice(0, 3)"
            :key="tIdx"
            :torrent="tr"
            :loading="downloadingKey === `ep-${episode.episodeNumber}-${tIdx}`"
            :disabled="downloadActive || (tr.magnetLink === null && tr.guid === null && tr.downloadUrl === null)"
            :limit-exceeded="isPrivateLimitExceeded(tr.isPrivate)"
            :is-dev="isDev"
            :debug-open="debugKey === `ep-${episode.episodeNumber}-${tIdx}`"
            @download="
              $emit('downloadTorrent', {
                magnetLink: tr.magnetLink,
                label: `${showName} S${String(selectedSeason).padStart(2, '0')}E${String(episode.episodeNumber).padStart(2, '0')} ${episode.name}`,
                key: `ep-${episode.episodeNumber}-${tIdx}`,
                type: undefined,
                guid: tr.guid,
                indexer: tr.indexer,
                downloadUrl: tr.downloadUrl,
                size: tr.size,
                resolution: tr.resolution
              })
            "
            @toggle-debug="$emit('toggleDebug', `ep-${episode.episodeNumber}-${tIdx}`)"
          />
        </div>

        <p v-else class="mt-2 text-xs text-zinc-400 dark:text-zinc-500">{{ t('tv.noTorrents') }}</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { Episode } from '~/types/browse'

defineProps<{
  episode: Episode
  showName: string
  selectedSeason: number
  downloadingKey: string | null
  isDev: boolean
  debugKey: string | null
  isPrivateLimitExceeded: (isPrivate: boolean) => boolean
}>()

const { active: downloadActive } = useDownloadOverlay()

defineEmits<{
  downloadTorrent: [
    payload: {
      magnetLink: string | null
      label: string
      key: string
      type: string | undefined
      guid: string | null
      indexer: string
      downloadUrl: string | null
      size: number
      resolution: string | null
    }
  ]
  toggleDebug: [key: string]
}>()

const { t } = useI18n()
</script>
