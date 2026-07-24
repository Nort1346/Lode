<template>
  <div ref="containerRef" class="min-w-0 overflow-hidden">
    <span
      ref="textRef"
      class="text-sm font-medium whitespace-nowrap text-zinc-900 dark:text-white"
      :class="
        isOverflowing
          ? ['marquee-text text-sm', phase === 'first' ? 'is-marquee-active' : 'is-marquee-looping']
          : 'line-clamp-1'
      "
      :style="isOverflowing ? { '--marquee-distance': `${scrollDistance}px` } : undefined"
      >{{ text }}</span
    >
  </div>
</template>

<script setup lang="ts">
defineProps<{
  text: string
}>()

const { containerRef, textRef, isOverflowing, scrollDistance, phase, recheck } = useMarquee()

watch(isOverflowing, () => {
  nextTick(recheck)
})
</script>
