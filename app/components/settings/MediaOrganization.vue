<script setup lang="ts">
import type { MediaConfigResponse } from '~/types/media-config'

const { t } = useI18n()
const toast = useToast()

const enabled = ref(false)
const importMode = ref('hardlink')
const importExtraFiles = ref(false)
const extraFileExtensions = ref('')
const savedExtensions = ref('')
const staging = ref({ movies: false, series: false })
const loading = ref(true)
const saving = ref(false)

const modeOptions = computed(() => [
  { label: t('settings.mediaModeHardlink'), value: 'hardlink' },
  { label: t('settings.mediaModeCopy'), value: 'copy' },
  { label: t('settings.mediaModeMove'), value: 'move' }
])

const stagingComplete = computed(() => staging.value.movies && staging.value.series)
// One configured staging dir is enough to import that category; the missing
// one is listed as a note instead of blocking the whole panel.
const stagingAny = computed(() => staging.value.movies || staging.value.series)
const stagingMissing = computed(() => {
  const missing: string[] = []
  if (!staging.value.movies) missing.push(t('settings.mediaStagingMissingMovies'))
  if (!staging.value.series) missing.push(t('settings.mediaStagingMissingSeries'))
  return missing
})

async function fetchConfig() {
  loading.value = true
  try {
    const data = await $fetch<MediaConfigResponse>('/api/admin/media-config')
    enabled.value = data.enabled
    importMode.value = data.importMode
    importExtraFiles.value = data.importExtraFiles
    extraFileExtensions.value = data.extraFileExtensions
    savedExtensions.value = data.extraFileExtensions
    staging.value = data.staging
  } catch {
    // keep defaults
  } finally {
    loading.value = false
  }
}

async function save(payload: Record<string, boolean | string>, apply: () => void) {
  saving.value = true
  try {
    await $fetch('/api/admin/media-config', { method: 'PUT', body: payload })
    apply()
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

function saveEnabled(val: boolean) {
  return save({ enabled: val }, () => {
    enabled.value = val
  })
}

function saveMode(val: string) {
  return save({ importMode: val }, () => {
    importMode.value = val
  })
}

function saveExtraFiles(val: boolean) {
  return save({ importExtraFiles: val }, () => {
    importExtraFiles.value = val
  })
}

// Blur fires even without a change, so skip the request when the field is
// untouched.
function saveExtensions() {
  if (extraFileExtensions.value === savedExtensions.value) return Promise.resolve()
  return save({ extraFileExtensions: extraFileExtensions.value }, () => {
    savedExtensions.value = extraFileExtensions.value
  })
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

      <div
        class="rounded-xl border p-3"
        :class="stagingAny ? 'border-green-500/40 bg-green-500/5' : 'border-amber-500/40 bg-amber-500/5'"
      >
        <div class="flex items-center gap-2 mb-1">
          <UIcon
            :name="stagingAny ? 'i-lucide-folder-check' : 'i-lucide-triangle-alert'"
            class="size-4"
            :class="stagingAny ? 'text-green-500' : 'text-amber-500'"
          />
          <span class="text-sm font-medium text-zinc-700 dark:text-zinc-300">{{
            t('settings.mediaStagingTitle')
          }}</span>
        </div>
        <p v-if="stagingAny" class="text-xs text-zinc-500 dark:text-zinc-400">
          {{ t('settings.mediaStagingOk') }}
        </p>
        <ul
          v-if="!stagingComplete"
          class="text-xs text-zinc-500 dark:text-zinc-400 list-disc list-inside space-y-1"
          :class="stagingAny ? 'mt-2' : ''"
        >
          <li v-for="message in stagingMissing" :key="message">{{ message }}</li>
        </ul>
      </div>

      <div>
        <label class="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">{{
          t('settings.mediaImportMode')
        }}</label>
        <USelect :model-value="importMode" :items="modeOptions" :disabled="saving" @update:model-value="saveMode" />
        <p class="text-xs text-zinc-400 dark:text-zinc-500 mt-1">{{ t('settings.mediaImportModeHint') }}</p>
      </div>

      <div>
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <UIcon
              :name="importExtraFiles ? 'i-lucide-check-circle' : 'i-lucide-x-circle'"
              class="size-4"
              :class="importExtraFiles ? 'text-green-500' : 'text-zinc-400'"
            />
            <label class="text-sm font-medium text-zinc-700 dark:text-zinc-300">{{
              t('settings.mediaExtraFiles')
            }}</label>
          </div>
          <USwitch
            :model-value="importExtraFiles"
            :disabled="saving || !enabled"
            @update:model-value="saveExtraFiles"
          />
        </div>
        <p class="text-xs text-zinc-400 dark:text-zinc-500 mt-1">{{ t('settings.mediaExtraFilesHint') }}</p>
      </div>

      <div>
        <label class="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">{{
          t('settings.mediaExtraExtensions')
        }}</label>
        <UInput
          v-model="extraFileExtensions"
          :disabled="saving || !enabled || !importExtraFiles"
          :placeholder="'srt, sub, ass, nfo'"
          class="w-full"
          @blur="saveExtensions"
        />
        <p class="text-xs text-zinc-400 dark:text-zinc-500 mt-1">{{ t('settings.mediaExtraExtensionsHint') }}</p>
      </div>
    </div>
  </div>
</template>
