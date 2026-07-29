<template>
  <div ref="containerRef" class="min-w-0 overflow-hidden">
    <span
      ref="textRef"
      class="text-sm font-medium whitespace-nowrap text-zinc-900 dark:text-white transition-opacity duration-500"
      :class="
        isOverflowing
          ? [
              'marquee-text text-sm',
              isScrolling ? (phase === 'first' ? 'is-marquee-active' : 'is-marquee-looping') : ''
            ]
          : 'line-clamp-1'
      "
      :style="
        isOverflowing
          ? {
              '--marquee-distance': `${scrollDistance}px`,
              '--marquee-duration': `${marqueeDuration}s`,
              opacity: textOpacity
            }
          : undefined
      "
      >{{ text }}</span
    >
  </div>
</template>

<script setup lang="ts">
defineProps<{
  text: string
}>()

const {
  containerRef,
  textRef,
  isOverflowing,
  scrollDistance,
  marqueeDuration,
  textOpacity,
  isScrolling,
  phase,
  recheck
} = useMarquee()

watch(isOverflowing, () => {
  nextTick(recheck)
})
</script>
