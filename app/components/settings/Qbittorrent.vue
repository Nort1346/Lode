<script setup lang="ts">
const { t } = useI18n()
const toast = useToast()

const autoRemove = ref(false)
const loading = ref(true)
const saving = ref(false)

async function fetchConfig() {
  loading.value = true
  try {
    const data = await $fetch<{ autoRemoveCompleted: boolean }>('/api/admin/qbit-config')
    autoRemove.value = data.autoRemoveCompleted
  } catch {
    // keep defaults
  } finally {
    loading.value = false
  }
}

async function saveAutoRemove(val: boolean) {
  saving.value = true
  try {
    await $fetch('/api/admin/qbit-config', { method: 'PUT', body: { autoRemoveCompleted: val } })
    autoRemove.value = val
    toast.add({ title: t('settings.qbittorrentSaved'), color: 'success' })
  } catch {
    toast.add({ title: t('settings.qbittorrentError'), color: 'error' })
  } finally {
    saving.value = false
  }
}

onMounted(fetchConfig)
</script>

<template>
  <div class="card p-6 mb-4">
    <h2 class="text-lg font-semibold text-zinc-900 dark:text-white mb-1">{{ t('settings.qbittorrentTitle') }}</h2>
    <p class="text-sm text-zinc-500 dark:text-zinc-400 mb-4">{{ t('settings.qbittorrentDesc') }}</p>

    <div v-if="loading" class="space-y-3">
      <USkeleton class="h-8 w-full rounded-xl" />
    </div>
    <div v-else class="space-y-4">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <UIcon
            :name="autoRemove ? 'i-lucide-check-circle' : 'i-lucide-x-circle'"
            class="size-4"
            :class="autoRemove ? 'text-green-500' : 'text-zinc-400'"
          />
          <label class="text-sm font-medium text-zinc-700 dark:text-zinc-300">{{ t('settings.qbitAutoRemove') }}</label>
        </div>
        <USwitch :model-value="autoRemove" :disabled="saving" @update:model-value="saveAutoRemove" />
      </div>
      <p class="text-xs text-zinc-400 dark:text-zinc-500">{{ t('settings.qbitAutoRemoveHint') }}</p>
    </div>
  </div>
</template>
