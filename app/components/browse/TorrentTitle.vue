<template>
  <div ref="containerRef" class="min-w-0 overflow-hidden">
    <span v-if="!isMeasured" ref="textRef" class="invisible absolute whitespace-nowrap text-sm">{{ text }}</span>
    <span v-else-if="!isOverflowing" class="text-sm text-zinc-800 dark:text-zinc-200 line-clamp-1">{{ text }}</span>
    <div v-else class="marquee-wrap" :style="{ '--marquee-duration': `${marqueeDuration}s` }">
      <span class="marquee-track">
        <span class="text-sm text-zinc-800 dark:text-zinc-200">{{ text }}</span>
        <span class="marquee-sep" aria-hidden="true">•</span>
        <span class="text-sm text-zinc-800 dark:text-zinc-200">{{ text }}</span>
        <span class="marquee-sep" aria-hidden="true">•</span>
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  text: string
}>()

const { containerRef, textRef, isOverflowing, isMeasured, marqueeDuration } = useMarquee()
</script>
