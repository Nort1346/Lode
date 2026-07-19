<template>
  <div
    class="flex flex-col gap-3 rounded-xl border border-purple-400 bg-white/50 p-4 dark:border-purple-500/30 dark:bg-purple-500/5 sm:flex-row sm:items-center sm:justify-between"
  >
    <div class="min-w-0 flex-1">
      <span class="flex items-center gap-2 text-xs font-bold text-purple-500">
        <UIcon name="i-lucide-layers" class="size-3" />
        {{ t('tv.seasonPack') }}
      </span>
      <p class="mt-1 line-clamp-1 text-sm text-zinc-800 dark:text-zinc-200">{{ pack.title }}</p>
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
      class="cursor-pointer"
      :loading="loading"
      :disabled="disabled || limitExceeded"
      @click="$emit('download')"
    >
      {{ limitExceeded ? t('tv.limitReached') : t('tv.downloadSeason') }}
    </UButton>
    <UButton v-if="isDev" size="xs" color="neutral" variant="ghost" icon="i-lucide-bug" @click="$emit('toggleDebug')" />
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
          <span class="text-zinc-700 dark:text-zinc-300">{{ pack.indexer }}</span>
        </div>
        <div class="flex items-center gap-2">
          <span class="w-24 text-zinc-400">magnetLink:</span>
          <span
            class="max-w-xs truncate"
            :class="pack.magnetLink ? 'text-emerald-600 dark:text-emerald-400' : 'text-zinc-400'"
          >
            {{ pack.magnetLink ?? '-' }}
          </span>
          <UButton
            v-if="pack.magnetLink"
            size="xs"
            color="neutral"
            variant="ghost"
            icon="i-lucide-copy"
            @click="copyToClipboard(pack.magnetLink!)"
          />
        </div>
        <div class="flex items-center gap-2">
          <span class="w-24 text-zinc-400">downloadUrl:</span>
          <span
            class="max-w-xs truncate"
            :class="pack.downloadUrl ? 'text-emerald-600 dark:text-emerald-400' : 'text-zinc-400'"
          >
            {{ pack.downloadUrl ?? '-' }}
          </span>
          <UButton
            v-if="pack.downloadUrl"
            size="xs"
            color="neutral"
            variant="ghost"
            icon="i-lucide-copy"
            @click="copyToClipboard(pack.downloadUrl!)"
          />
        </div>
        <div class="flex items-center gap-2">
          <span class="w-24 text-zinc-400">guid:</span>
          <span
            class="max-w-xs truncate"
            :class="pack.guid ? 'text-emerald-600 dark:text-emerald-400' : 'text-zinc-400'"
          >
            {{ pack.guid ?? '-' }}
          </span>
          <UButton
            v-if="pack.guid"
            size="xs"
            color="neutral"
            variant="ghost"
            icon="i-lucide-copy"
            @click="copyToClipboard(pack.guid!)"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { SeasonPack } from '~/types/media'

defineProps<{
  pack: SeasonPack
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
