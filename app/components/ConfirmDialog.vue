<script setup lang="ts">
defineProps<{
  title: string
  description: string
  confirmLabel?: string
  cancelLabel?: string
  loading?: boolean
}>()

const emit = defineEmits<{
  confirm: []
  close: [value: boolean]
}>()

function onConfirm() {
  emit('confirm')
  emit('close', true)
}
</script>

<template>
  <UModal>
    <template #header>
      <h3 class="text-lg font-semibold text-zinc-900 dark:text-white">{{ title }}</h3>
    </template>
    <template #body>
      <p class="text-sm text-zinc-600 dark:text-zinc-400">{{ description }}</p>
    </template>
    <template #footer>
      <div class="flex justify-end gap-2">
        <UButton variant="soft" :label="cancelLabel" @click="emit('close', false)" />
        <UButton color="error" :label="confirmLabel" :loading="loading" @click="onConfirm" />
      </div>
    </template>
  </UModal>
</template>
