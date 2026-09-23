<template>
  <div role="status" class="flex items-center justify-center py-5 sm:py-6">
    <span class="sr-only">{{ t('browse.searching.0') }}</span>
    <div aria-hidden="true" class="flex items-center gap-3">
      <div class="relative flex size-8 items-center justify-center">
        <span v-if="!reducedMotion" class="ripple absolute size-5 rounded-full bg-amber-500" />
        <span v-if="!reducedMotion" class="ripple absolute size-5 rounded-full bg-amber-500 [animation-delay:0.6s]" />
        <span v-if="!reducedMotion" class="ripple absolute size-5 rounded-full bg-amber-500 [animation-delay:1.2s]" />
        <UIcon name="i-lucide-search" class="relative size-4 text-amber-500" />
      </div>
      <p
        class="text-sm font-medium text-zinc-500 transition-opacity duration-300 motion-reduce:transition-none dark:text-zinc-400"
        :class="fading ? 'opacity-0' : 'opacity-100'"
      >
        {{ currentPhrase }}
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
// Rotates a staged "still working" phrase ladder while browse search runs,
// mirroring DownloadOverlay.vue: same ripple keyframes, same 2300ms swap
// interval and 300ms opacity crossfade.
const SWAP_INTERVAL = 2300
const FADE_DURATION = 300
const PHRASE_COUNT = 4
const LOOP_START = PHRASE_COUNT - 2

const { t, locale } = useI18n()

const reducedMotion = ref(false)
const currentPhrase = ref('')
const fading = ref(false)

let phraseIndex = 0
let swapTimer: ReturnType<typeof setInterval> | null = null
let fadeTimer: ReturnType<typeof setTimeout> | null = null
let mediaQuery: MediaQueryList | null = null
let onMotionChange: ((e: MediaQueryListEvent) => void) | null = null

function phraseAt(index: number): string {
  return t(`browse.searching.${index}`, {}, { locale: locale.value })
}

function nextIndex(): number {
  if (phraseIndex >= LOOP_START) return phraseIndex === PHRASE_COUNT - 1 ? PHRASE_COUNT - 2 : PHRASE_COUNT - 1
  return phraseIndex + 1
}

function clearTimers() {
  if (swapTimer !== null) {
    clearInterval(swapTimer)
    swapTimer = null
  }
  if (fadeTimer !== null) {
    clearTimeout(fadeTimer)
    fadeTimer = null
  }
}

function startRotation() {
  if (reducedMotion.value) return
  swapTimer = setInterval(() => {
    fading.value = true
    fadeTimer = setTimeout(() => {
      phraseIndex = nextIndex()
      currentPhrase.value = phraseAt(phraseIndex)
      fading.value = false
    }, FADE_DURATION)
  }, SWAP_INTERVAL)
}

function resetToFirst() {
  clearTimers()
  phraseIndex = 0
  fading.value = false
  currentPhrase.value = phraseAt(0)
}

onMounted(() => {
  currentPhrase.value = phraseAt(0)
  mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
  reducedMotion.value = mediaQuery.matches
  onMotionChange = (e: MediaQueryListEvent) => {
    reducedMotion.value = e.matches
    if (e.matches) {
      resetToFirst()
    } else {
      startRotation()
    }
  }
  mediaQuery.addEventListener('change', onMotionChange)
  startRotation()
})

onBeforeUnmount(() => {
  if (mediaQuery !== null && onMotionChange !== null) mediaQuery.removeEventListener('change', onMotionChange)
  clearTimers()
})
</script>

<style scoped>
.ripple {
  animation: ripple 1.8s ease-out infinite;
}

@keyframes ripple {
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
