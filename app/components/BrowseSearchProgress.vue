<template>
  <div
    class="flex flex-col items-center justify-center gap-4 rounded-xl bg-zinc-100/50 px-6 py-12 dark:bg-zinc-800/50"
    role="status"
    aria-live="polite"
  >
    <div class="relative flex size-16 items-center justify-center">
      <span class="search-ripple absolute size-5 rounded-full bg-amber-500" />
      <span class="search-ripple absolute size-5 rounded-full bg-amber-500 [animation-delay:0.6s]" />
      <span class="search-ripple absolute size-5 rounded-full bg-amber-500 [animation-delay:1.2s]" />
    </div>
    <div class="flex flex-col items-center gap-1.5 text-center">
      <Transition name="search-progress" mode="out-in">
        <p :key="message" class="text-base font-semibold text-zinc-900 dark:text-zinc-100">{{ message }}</p>
      </Transition>
      <p v-if="meta !== null" class="text-xs text-zinc-500 dark:text-zinc-400">{{ meta }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { TorrentSearchPhase } from '~/composables/useTorrentSearch'

const props = defineProps<{
  phase: TorrentSearchPhase
  label: string
  queriesTotal: number
  queriesCompleted: number
  currentQuery: string | null
  found: number
}>()

const { t } = useI18n()

const message = computed(() => {
  if (props.phase === 'connecting') return t('browse.searchProgress.connecting')
  if (props.phase === 'finishing') return t('browse.searchProgress.finishing')
  if (props.phase === 'searching' && props.currentQuery !== null) {
    return t('browse.searchProgress.query', { text: props.currentQuery })
  }
  return t('browse.searchProgress.searching', { title: props.label })
})

const meta = computed(() => {
  const parts: string[] = []
  if (props.queriesTotal > 0) {
    parts.push(t('browse.searchProgress.progress', { done: props.queriesCompleted, total: props.queriesTotal }))
  }
  if (props.found > 0) {
    parts.push(t('browse.searchProgress.found', { count: props.found }))
  }
  return parts.length > 0 ? parts.join(' · ') : null
})
</script>

<style scoped>
/* Motion mirrors the "Adding download" overlay; both the ripple and the text
   crossfade are disabled under prefers-reduced-motion (static dot, instant
   swap) */
@media (prefers-reduced-motion: no-preference) {
  .search-ripple {
    animation: search-ripple 1.8s ease-out infinite;
  }

  .search-progress-enter-active,
  .search-progress-leave-active {
    transition: opacity 300ms ease;
  }

  .search-progress-enter-from,
  .search-progress-leave-to {
    opacity: 0;
  }
}

@keyframes search-ripple {
  0% {
    transform: scale(1);
    opacity: 0.6;
  }
  100% {
    transform: scale(2.5);
    opacity: 0;
  }
}
</style>
