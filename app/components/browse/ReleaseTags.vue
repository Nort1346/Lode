<template>
  <div v-if="hasBadges" role="group" :aria-label="t('browse.releaseTags')" class="flex flex-wrap items-center gap-1">
    <!-- One consistent row everywhere: resolution first, then release tags,
         language last (muted). Every badge keeps the same geometry
         (rounded px-1.5 py-0.5 text-xs) and stays whole on one line -->
    <span
      v-if="props.resolution"
      class="rounded px-1.5 py-0.5 text-xs font-bold whitespace-nowrap"
      :class="resolutionClass"
    >
      {{ props.resolution.toUpperCase() }}
    </span>
    <span
      v-for="tag in shown"
      :key="tag"
      class="rounded px-1.5 py-0.5 text-xs whitespace-nowrap"
      :class="badgeClass(tag)"
      >{{ tag }}</span
    >
    <span
      v-if="hidden.length > 0"
      class="rounded bg-zinc-200/50 px-1.5 py-0.5 text-xs whitespace-nowrap text-zinc-600 dark:bg-zinc-700/50 dark:text-zinc-400"
      :title="hidden.join(', ')"
    >
      +{{ hidden.length }}
    </span>
    <span
      v-if="props.languageLabel"
      class="rounded bg-zinc-200/50 px-1.5 py-0.5 text-xs whitespace-nowrap text-zinc-600 dark:bg-zinc-700/50 dark:text-zinc-400"
    >
      {{ props.languageLabel }}
    </span>
  </div>
</template>

<script setup lang="ts">
// Source badge tiers reuse the existing badge color pairs from the browse
// torrent cards (emerald/blue/zinc for resolution, red for capture sources)
const SOURCE_BADGES: Record<string, string> = {
  Remux: 'font-bold bg-emerald-500/20 text-emerald-600 dark:text-emerald-400',
  BluRay: 'font-bold bg-emerald-500/20 text-emerald-600 dark:text-emerald-400',
  BDRip: 'font-bold bg-emerald-500/20 text-emerald-600 dark:text-emerald-400',
  BRRip: 'font-bold bg-emerald-500/20 text-emerald-600 dark:text-emerald-400',
  'WEB-DL': 'font-bold bg-emerald-500/20 text-emerald-600 dark:text-emerald-400',
  WEBRip: 'font-bold bg-blue-500/20 text-blue-600 dark:text-blue-400',
  WEB: 'font-bold bg-blue-500/20 text-blue-600 dark:text-blue-400',
  HDTV: 'font-bold bg-blue-500/20 text-blue-600 dark:text-blue-400',
  HDRip: 'font-bold bg-zinc-500/20 text-zinc-600 dark:text-zinc-400',
  DVDRip: 'font-bold bg-zinc-500/20 text-zinc-600 dark:text-zinc-400',
  DVD: 'font-bold bg-zinc-500/20 text-zinc-600 dark:text-zinc-400',
  DVDScr: 'font-bold bg-zinc-500/20 text-zinc-600 dark:text-zinc-400',
  SCR: 'font-bold bg-zinc-500/20 text-zinc-600 dark:text-zinc-400',
  TC: 'font-bold bg-red-500/20 text-red-600 dark:text-red-400',
  HDTS: 'font-bold bg-red-500/20 text-red-600 dark:text-red-400',
  TS: 'font-bold bg-red-500/20 text-red-600 dark:text-red-400',
  CAM: 'font-bold bg-red-500/20 text-red-600 dark:text-red-400',
  HDCAM: 'font-bold bg-red-500/20 text-red-600 dark:text-red-400'
}

const MUTED_BADGE = 'bg-zinc-200/50 text-zinc-600 dark:bg-zinc-700/50 dark:text-zinc-400'

const MAX_VISIBLE = 5

const props = withDefaults(
  defineProps<{
    tags: string[]
    resolution?: string | null
    languageLabel?: string | null
  }>(),
  {
    resolution: null,
    languageLabel: null
  }
)

const { t } = useI18n()

const shown = computed(() => props.tags.slice(0, MAX_VISIBLE))
const hidden = computed(() => props.tags.slice(MAX_VISIBLE))

const hasBadges = computed(() => props.tags.length > 0 || props.resolution !== null || props.languageLabel !== null)

// Same resolution tiers the movie card used before the badges were unified
const resolutionClass = computed(() => {
  if (props.resolution === '1080p') return 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400'
  if (props.resolution === '4k' || props.resolution === '2160p' || props.resolution === '8k')
    return 'bg-blue-500/20 text-blue-600 dark:text-blue-400'
  return 'bg-zinc-500/20 text-zinc-600 dark:text-zinc-400'
})

function badgeClass(tag: string): string {
  return SOURCE_BADGES[tag] ?? MUTED_BADGE
}
</script>
