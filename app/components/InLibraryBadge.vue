<template>
  <span
    class="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-white shadow-md"
  >
    <UIcon name="i-lucide-circle-check" class="size-4" />
    {{ t('browse.inLibrary') }}
  </span>
</template>

<script setup lang="ts">
const { t } = useI18n()
</script>
