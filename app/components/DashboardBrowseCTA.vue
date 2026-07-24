<template>
  <NuxtLink
    to="/browse"
    class="group block rounded-2xl border border-zinc-200 bg-linear-to-r from-amber-500/10 via-orange-500/10 to-red-500/10 p-6 transition-all hover:from-amber-500/20 hover:via-orange-500/20 hover:to-red-500/20 hover:shadow-lg dark:border-white/10 dark:hover:shadow-amber-500/10"
  >
    <div class="flex items-center justify-between">
      <div>
        <h3 class="text-lg font-bold text-zinc-900 dark:text-white">{{ t('dashboard.browseCTA') }}</h3>
        <p class="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{{ t('dashboard.browseCTADesc') }}</p>
      </div>
      <div
        class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-500/15 transition-transform group-hover:translate-x-1 dark:bg-amber-500/20"
      >
        <UIcon name="i-lucide-arrow-right" class="size-5 text-amber-600 dark:text-amber-400" />
      </div>
    </div>
  </NuxtLink>
</template>

<script setup lang="ts">
const { t } = useI18n()
</script>
