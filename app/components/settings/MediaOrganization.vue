<script setup lang="ts">
const { t } = useI18n()
const toast = useToast()

const enabled = ref(false)
const importMode = ref('hardlink')
const loading = ref(true)
const saving = ref(false)

const modeOptions = computed(() => [
  { label: t('settings.mediaModeHardlink'), value: 'hardlink' },
  { label: t('settings.mediaModeCopy'), value: 'copy' },
  { label: t('settings.mediaModeMove'), value: 'move' }
])

interface MediaConfigResponse {
  enabled: boolean
  importMode: string
}

async function fetchConfig() {
  loading.value = true
  try {
    const data = await $fetch<MediaConfigResponse>('/api/admin/media-config')
    enabled.value = data.enabled
    importMode.value = data.importMode
  } catch {
    // keep defaults
  } finally {
    loading.value = false
  }
}

async function saveEnabled(val: boolean) {
  saving.value = true
  try {
    await $fetch('/api/admin/media-config', { method: 'PUT', body: { enabled: val } })
    enabled.value = val
    toast.add({ title: t('settings.mediaSaved'), color: 'success' })
  } catch (e: unknown) {
    toast.add({
      title: t('settings.mediaError'),
      description: describeApiError(e, t).description,
      color: 'error'
    })
  } finally {
    saving.value = false
  }
}

async function saveMode(val: string) {
  saving.value = true
  try {
    await $fetch('/api/admin/media-config', { method: 'PUT', body: { importMode: val } })
    importMode.value = val
    toast.add({ title: t('settings.mediaSaved'), color: 'success' })
  } catch (e: unknown) {
    toast.add({
      title: t('settings.mediaError'),
      description: describeApiError(e, t).description,
      color: 'error'
    })
  } finally {
    saving.value = false
  }
}

onMounted(fetchConfig)
</script>

<template>
  <div class="card p-6 mb-4">
    <h2 class="text-lg font-semibold text-zinc-900 dark:text-white mb-1">{{ t('settings.mediaTitle') }}</h2>
    <p class="text-sm text-zinc-500 dark:text-zinc-400 mb-4">{{ t('settings.mediaDesc') }}</p>

    <div v-if="loading" class="space-y-3">
      <USkeleton class="h-8 w-full rounded-xl" />
    </div>
    <div v-else class="space-y-4">
      <div>
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <UIcon
              :name="enabled ? 'i-lucide-check-circle' : 'i-lucide-x-circle'"
              class="size-4"
              :class="enabled ? 'text-green-500' : 'text-zinc-400'"
            />
            <label class="text-sm font-medium text-zinc-700 dark:text-zinc-300">{{ t('settings.mediaEnabled') }}</label>
          </div>
          <USwitch :model-value="enabled" :disabled="saving" @update:model-value="saveEnabled" />
        </div>
        <p class="text-xs text-zinc-400 dark:text-zinc-500 mt-1">{{ t('settings.mediaEnabledHint') }}</p>
      </div>
      <div>
        <label class="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">{{
          t('settings.mediaImportMode')
        }}</label>
        <USelect :model-value="importMode" :items="modeOptions" :disabled="saving" @update:model-value="saveMode" />
        <p class="text-xs text-zinc-400 dark:text-zinc-500 mt-1">{{ t('settings.mediaImportModeHint') }}</p>
      </div>
    </div>
  </div>
</template>
