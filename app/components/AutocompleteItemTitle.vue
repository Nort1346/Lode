<template>
  <div ref="containerRef" class="min-w-0 overflow-hidden">
    <span v-if="!isMeasured" ref="textRef" class="invisible absolute whitespace-nowrap text-sm font-medium">{{
      text
    }}</span>
    <span v-else-if="!isOverflowing" class="text-sm font-medium text-zinc-900 dark:text-white line-clamp-1">{{
      text
    }}</span>
    <div v-else class="marquee-wrap" :style="{ '--marquee-duration': `${marqueeDuration}s` }">
      <span class="marquee-track">
        <span class="text-sm font-medium text-zinc-900 dark:text-white">{{ text }}</span>
        <span class="marquee-sep" aria-hidden="true">•</span>
        <span class="text-sm font-medium text-zinc-900 dark:text-white">{{ text }}</span>
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
