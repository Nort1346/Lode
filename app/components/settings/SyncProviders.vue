<script setup lang="ts">
import type { JellyfinLibrary } from '~/types/admin'

const { t } = useI18n()
const toast = useToast()

const loading = ref(true)
const saving = ref(false)
const libraries = ref<JellyfinLibrary[]>([])
const librariesLoading = ref(true)

const presets = reactive({
  syncEnabled: true,
  libraryAccess: 'all' as string[] | 'all',
  videoTranscoding: true,
  audioTranscoding: true,
  remuxing: true,
  liveTvAccess: true,
  liveTvManagement: false,
  maxActiveSessions: 0
})

const allLibrariesSelected = computed(() => presets.libraryAccess === 'all')

function isSelected(libraryId: string): boolean {
  return (
    allLibrariesSelected.value || (Array.isArray(presets.libraryAccess) && presets.libraryAccess.includes(libraryId))
  )
}

function toggleLibraryAccess() {
  if (allLibrariesSelected.value) {
    presets.libraryAccess = libraries.value.map((l) => l.id)
  } else {
    presets.libraryAccess = 'all'
  }
}

function toggleLibrary(libraryId: string) {
  const current = Array.isArray(presets.libraryAccess)
    ? [...presets.libraryAccess]
    : libraries.value.map((l) => l.id)

  const index = current.indexOf(libraryId)
  if (index >= 0) {
    current.splice(index, 1)
  } else {
    current.push(libraryId)
  }

  presets.libraryAccess = current.length === 0 ? 'all' : current
}

async function fetchLibraries() {
  try {
    const res = await $fetch('/api/admin/sync/libraries')
    const data = res as Array<{ name: string; libraries: JellyfinLibrary[] }>
    const jellyfin = data.find((p) => p.name === 'jellyfin')
    libraries.value = jellyfin?.libraries ?? []
  } catch {
    // silently fail
  } finally {
    librariesLoading.value = false
  }
}

async function fetchPresets() {
  loading.value = true
  try {
    const res = await $fetch('/api/admin/jellyfin/presets')
    const data = res as typeof presets
    if (typeof data.libraryAccess === 'string' && data.libraryAccess !== 'all') {
      data.libraryAccess = JSON.parse(data.libraryAccess)
    }
    Object.assign(presets, data)
  } catch {
    // silently fail
  } finally {
    loading.value = false
  }
}

async function savePresets() {
  saving.value = true
  try {
    await $fetch('/api/admin/jellyfin/presets', {
      method: 'PUT',
      body: presets
    })
    toast.add({ title: t('admin.jellyfinPresetsSaved'), color: 'success' })
  } catch {
    toast.add({ title: t('admin.jellyfinPresetsError'), color: 'error' })
  } finally {
    saving.value = false
  }
}

onMounted(() => {
  fetchPresets()
  fetchLibraries()
})
</script>

<template>
  <div class="card p-6 mb-4">
    <div class="flex items-center justify-between mb-4">
      <div class="flex items-center gap-2">
        <UIcon name="i-simple-icons-jellyfin" class="w-5 h-5 text-blue-500" />
        <h3 class="text-lg font-semibold text-zinc-900 dark:text-white">{{ t('admin.jellyfinPresets') }}</h3>
      </div>
      <USwitch v-model="presets.syncEnabled" />
    </div>

    <div v-if="loading" class="flex justify-center py-8">
      <UIcon name="i-lucide-loader-2" class="w-6 h-6 text-amber-500 animate-spin" />
    </div>

    <div v-else-if="presets.syncEnabled" class="space-y-4">
      <div>
        <h4 class="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-2">
          {{ t('admin.jellyfinLibraries') }}
        </h4>
        <div v-if="librariesLoading" class="flex items-center gap-2 text-sm text-zinc-400 py-2">
          <UIcon name="i-lucide-loader-2" class="w-4 h-4 animate-spin" />
          {{ t('admin.loading') }}...
        </div>
        <div v-else-if="libraries.length === 0" class="text-sm text-zinc-400 py-2">
          {{ t('admin.jellyfinNoLibraries') }}
        </div>
        <div v-else class="space-y-2">
          <button
            type="button"
            class="text-xs text-blue-500 hover:text-blue-400 transition-colors"
            @click="toggleLibraryAccess"
          >
            {{ allLibrariesSelected ? t('admin.jellyfinSelectLibraries') : t('admin.jellyfinAllLibraries') }}
          </button>
          <div
            class="grid grid-cols-1 sm:grid-cols-2 gap-1.5 p-2 rounded-lg bg-zinc-50 dark:bg-white/5 border border-zinc-200 dark:border-white/10"
          >
            <label
              v-for="lib in libraries"
              :key="lib.id"
              class="flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-zinc-600 dark:text-zinc-300 cursor-pointer hover:bg-zinc-100 dark:hover:bg-white/10 transition-colors"
            >
              <UCheckbox :model-value="isSelected(lib.id)" @update:model-value="toggleLibrary(lib.id)" />
              {{ lib.name }}
            </label>
          </div>
        </div>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <div class="p-3 rounded-lg bg-zinc-50 dark:bg-white/5 border border-zinc-200 dark:border-white/10 space-y-1">
          <div class="flex items-center justify-between">
            <span class="text-sm font-medium text-zinc-700 dark:text-zinc-300">{{
              t('admin.jellyfinVideoTranscoding')
            }}</span>
            <USwitch v-model="presets.videoTranscoding" />
          </div>
          <p class="text-xs text-zinc-400">{{ t('admin.jellyfinVideoTranscodingDesc') }}</p>
        </div>
        <div class="p-3 rounded-lg bg-zinc-50 dark:bg-white/5 border border-zinc-200 dark:border-white/10 space-y-1">
          <div class="flex items-center justify-between">
            <span class="text-sm font-medium text-zinc-700 dark:text-zinc-300">{{
              t('admin.jellyfinAudioTranscoding')
            }}</span>
            <USwitch v-model="presets.audioTranscoding" />
          </div>
          <p class="text-xs text-zinc-400">{{ t('admin.jellyfinAudioTranscodingDesc') }}</p>
        </div>
        <div class="p-3 rounded-lg bg-zinc-50 dark:bg-white/5 border border-zinc-200 dark:border-white/10 space-y-1">
          <div class="flex items-center justify-between">
            <span class="text-sm font-medium text-zinc-700 dark:text-zinc-300">{{ t('admin.jellyfinRemuxing') }}</span>
            <USwitch v-model="presets.remuxing" />
          </div>
          <p class="text-xs text-zinc-400">{{ t('admin.jellyfinRemuxingDesc') }}</p>
        </div>
        <div class="p-3 rounded-lg bg-zinc-50 dark:bg-white/5 border border-zinc-200 dark:border-white/10 space-y-1">
          <div class="flex items-center justify-between">
            <span class="text-sm font-medium text-zinc-700 dark:text-zinc-300">{{
              t('admin.jellyfinLiveTvAccess')
            }}</span>
            <USwitch v-model="presets.liveTvAccess" />
          </div>
          <p class="text-xs text-zinc-400">{{ t('admin.jellyfinLiveTvAccessDesc') }}</p>
        </div>
        <div class="p-3 rounded-lg bg-zinc-50 dark:bg-white/5 border border-zinc-200 dark:border-white/10 space-y-1">
          <div class="flex items-center justify-between">
            <span class="text-sm font-medium text-zinc-700 dark:text-zinc-300">{{
              t('admin.jellyfinLiveTvManagement')
            }}</span>
            <USwitch v-model="presets.liveTvManagement" />
          </div>
          <p class="text-xs text-zinc-400">{{ t('admin.jellyfinLiveTvManagementDesc') }}</p>
        </div>
        <div class="p-3 rounded-lg bg-zinc-50 dark:bg-white/5 border border-zinc-200 dark:border-white/10 space-y-1">
          <span class="text-sm font-medium text-zinc-700 dark:text-zinc-300">{{ t('admin.jellyfinMaxSessions') }}</span>
          <UInput v-model.number="presets.maxActiveSessions" type="number" class="mt-1 w-full" />
          <p class="text-xs text-zinc-400">{{ t('admin.jellyfinMaxSessionsDesc') }}</p>
        </div>
      </div>

      <div class="flex justify-end pt-2">
        <UButton :loading="saving" :label="t('admin.saveChanges')" @click="savePresets" />
      </div>
    </div>
  </div>
</template>
