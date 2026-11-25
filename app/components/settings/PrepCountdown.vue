<script setup lang="ts">
const { t } = useI18n()
const toast = useToast()

const enabled = ref(false)
const delaySeconds = ref(30)
const loading = ref(true)
const saving = ref(false)

async function fetchConfig() {
  loading.value = true
  try {
    const data = await $fetch<{ enabled: boolean; delaySeconds: number }>('/api/admin/prep-config')
    enabled.value = data.enabled
    delaySeconds.value = data.delaySeconds
  } catch {
    // keep defaults
  } finally {
    loading.value = false
  }
}

async function saveEnabled(val: boolean) {
  saving.value = true
  try {
    await $fetch('/api/admin/prep-config', { method: 'PUT', body: { enabled: val } })
    enabled.value = val
    toast.add({ title: t('settings.prepCountdownSaved'), color: 'success' })
  } catch (e: unknown) {
    toast.add({
      title: t('settings.prepCountdownError'),
      description: describeApiError(e, t).description,
      color: 'error'
    })
  } finally {
    saving.value = false
  }
}

async function saveDelay(val: number | undefined) {
  if (val === undefined) return
  const clamped = Math.max(0, Math.min(300, Math.round(val)))
  saving.value = true
  try {
    await $fetch('/api/admin/prep-config', { method: 'PUT', body: { delaySeconds: clamped } })
    delaySeconds.value = clamped
    toast.add({ title: t('settings.prepCountdownSaved'), color: 'success' })
  } catch (e: unknown) {
    toast.add({
      title: t('settings.prepCountdownError'),
      description: describeApiError(e, t).description,
      color: 'error'
    })
  } finally {
    saving.value = false
  }
}

let delayTimer: ReturnType<typeof setTimeout> | null = null

function onDelayInput(val: number | undefined) {
  if (val === undefined) return
  delaySeconds.value = Math.max(0, Math.min(300, Math.round(val)))
  if (delayTimer !== null) clearTimeout(delayTimer)
  delayTimer = setTimeout(() => {
    void saveDelay(delaySeconds.value)
  }, 500)
}

onMounted(fetchConfig)

onUnmounted(() => {
  // A pending debounced save must not fire after the component is gone
  if (delayTimer !== null) clearTimeout(delayTimer)
})
</script>

<template>
  <div class="card p-6 mb-4">
    <h2 class="text-lg font-semibold text-zinc-900 dark:text-white mb-1">{{ t('settings.prepCountdownTitle') }}</h2>
    <p class="text-sm text-zinc-500 dark:text-zinc-400 mb-4">{{ t('settings.prepCountdownDesc') }}</p>

    <div v-if="loading" class="space-y-3">
      <USkeleton class="h-8 w-full rounded-xl" />
      <USkeleton class="h-8 w-48 rounded-xl" />
    </div>
    <div v-else class="space-y-4">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <UIcon
            :name="enabled ? 'i-lucide-check-circle' : 'i-lucide-x-circle'"
            class="size-4"
            :class="enabled ? 'text-green-500' : 'text-zinc-400'"
          />
          <label class="text-sm font-medium text-zinc-700 dark:text-zinc-300">{{
            t('settings.prepCountdownEnabled')
          }}</label>
        </div>
        <USwitch :model-value="enabled" :disabled="saving" @update:model-value="saveEnabled" />
      </div>

      <div v-if="enabled" class="space-y-4 pt-1">
        <label class="text-sm font-medium text-zinc-700 dark:text-zinc-300">
          {{ t('settings.prepCountdownDelay') }}:
          <span class="text-amber-600 dark:text-amber-400">{{ delaySeconds }} s</span>
        </label>
        <USlider v-model="delaySeconds" class="mt-3" :min="0" :max="300" :step="1" @update:model-value="onDelayInput" />
        <p class="text-xs text-zinc-400 dark:text-zinc-500 mt-1">{{ t('settings.prepCountdownDelayHint') }}</p>
      </div>
    </div>
  </div>
</template>
