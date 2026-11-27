<template>
  <div
    class="flex flex-col items-center justify-center rounded-3xl border border-dashed border-zinc-300 bg-white/60 px-6 py-16 text-center dark:border-white/10 dark:bg-white/[0.02]"
  >
    <div class="flex size-14 items-center justify-center rounded-2xl bg-amber-500/10 ring-1 ring-amber-500/20">
      <UIcon :name="icon" class="size-7 text-amber-600 dark:text-amber-400" />
    </div>
    <h2 class="mt-5 text-lg font-semibold text-zinc-900 dark:text-white">
      {{ title }}
    </h2>
    <p class="mt-2 max-w-md text-sm leading-relaxed text-zinc-500 dark:text-zinc-400">
      {{ description }}
    </p>
    <div v-if="$slots.default" class="mt-6">
      <slot />
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  icon: string
  title: string
  description: string
}>()
</script>
