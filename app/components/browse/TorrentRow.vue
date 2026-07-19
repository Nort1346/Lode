<template>
  <div>
    <div
      class="flex flex-wrap items-center gap-3 rounded-lg p-2 transition-colors"
      :class="
        torrent.recommended
          ? 'bg-white/50 ring-1 ring-amber-400/60 dark:bg-amber-500/10 dark:ring-amber-500/30'
          : 'bg-zinc-100/50 dark:bg-zinc-700/30'
      "
    >
      <span
        class="text-xs font-bold"
        :class="
          torrent.percentage >= 80 ? 'text-emerald-500' : torrent.percentage >= 60 ? 'text-amber-500' : 'text-zinc-500'
        "
      >
        {{ torrent.percentage }}%
      </span>
      <span v-if="torrent.recommended" class="hidden text-xs text-amber-500 sm:inline-flex">
        <UIcon name="i-lucide-star" class="size-3" />
      </span>
      <span class="min-w-0 flex-1 text-xs text-zinc-700 line-clamp-2 dark:text-zinc-300">{{ torrent.title }}</span>
      <span class="hidden text-xs text-zinc-500 sm:inline">{{ torrent.sizeFormatted }}</span>
      <span class="flex items-center gap-1 text-xs text-emerald-500">
        <UIcon name="i-lucide-arrow-up" class="size-3" />{{ torrent.seeders }}
      </span>
      <span class="hidden text-xs text-zinc-500 sm:inline">{{ torrent.indexer }}</span>
      <UButton
        size="xs"
        :color="limitExceeded ? 'error' : 'warning'"
        :variant="limitExceeded ? 'solid' : 'ghost'"
        icon="i-lucide-download"
        class="cursor-pointer"
        :loading="loading"
        :disabled="disabled || limitExceeded"
        @click="$emit('download')"
      >
        <template v-if="limitExceeded">
          {{ t('tv.limitReached') }}
        </template>
      </UButton>
      <UButton
        v-if="isDev"
        size="xs"
        color="neutral"
        variant="ghost"
        icon="i-lucide-bug"
        @click="$emit('toggleDebug')"
      />
    </div>
    <div
      v-if="isDev && debugOpen"
      class="w-full rounded-lg border border-zinc-200 bg-zinc-50 p-3 font-mono text-xs dark:border-zinc-700 dark:bg-zinc-900"
    >
      <div class="mb-2 flex items-center gap-2 font-bold text-zinc-500 dark:text-zinc-400">
        <UIcon name="i-lucide-bug" class="size-3" />
        Dev Info
      </div>
      <div class="space-y-1.5">
        <div class="flex items-center gap-2">
          <span class="w-24 text-zinc-400">indexer:</span>
          <span class="text-zinc-700 dark:text-zinc-300">{{ torrent.indexer }}</span>
        </div>
        <div class="flex items-center gap-2">
          <span class="w-24 text-zinc-400">magnetLink:</span>
          <span
            class="max-w-xs truncate"
            :class="torrent.magnetLink ? 'text-emerald-600 dark:text-emerald-400' : 'text-zinc-400'"
          >
            {{ torrent.magnetLink ?? '-' }}
          </span>
          <UButton
            v-if="torrent.magnetLink"
            size="xs"
            color="neutral"
            variant="ghost"
            icon="i-lucide-copy"
            @click="copyToClipboard(torrent.magnetLink!)"
          />
        </div>
        <div class="flex items-center gap-2">
          <span class="w-24 text-zinc-400">downloadUrl:</span>
          <span
            class="max-w-xs truncate"
            :class="torrent.downloadUrl ? 'text-emerald-600 dark:text-emerald-400' : 'text-zinc-400'"
          >
            {{ torrent.downloadUrl ?? '-' }}
          </span>
          <UButton
            v-if="torrent.downloadUrl"
            size="xs"
            color="neutral"
            variant="ghost"
            icon="i-lucide-copy"
            @click="copyToClipboard(torrent.downloadUrl!)"
          />
        </div>
        <div class="flex items-center gap-2">
          <span class="w-24 text-zinc-400">guid:</span>
          <span
            class="max-w-xs truncate"
            :class="torrent.guid ? 'text-emerald-600 dark:text-emerald-400' : 'text-zinc-400'"
          >
            {{ torrent.guid ?? '-' }}
          </span>
          <UButton
            v-if="torrent.guid"
            size="xs"
            color="neutral"
            variant="ghost"
            icon="i-lucide-copy"
            @click="copyToClipboard(torrent.guid!)"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { EpisodeTorrent } from '~/types/media'

defineProps<{
  torrent: EpisodeTorrent
  loading: boolean
  disabled: boolean
  limitExceeded: boolean
  isDev: boolean
  debugOpen: boolean
}>()

defineEmits<{
  download: []
  toggleDebug: []
}>()

const { t } = useI18n()
const { copyToClipboard } = useCopyToClipboard()
</script>
