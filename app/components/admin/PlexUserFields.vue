<script setup lang="ts">
import type { JellyfinLibrary } from '~/types/admin'

const props = withDefaults(
  defineProps<{
    plexLibraryAccess: string[] | 'all'
    plexEnableLiveTvAccess: boolean
    plexEnableSync: boolean
    plexConfigured?: boolean
  }>(),
  {
    plexConfigured: true
  }
)

const emit = defineEmits<{
  'update:plexLibraryAccess': [value: string[] | 'all']
  'update:plexEnableLiveTvAccess': [value: boolean]
  'update:plexEnableSync': [value: boolean]
}>()

const { t } = useI18n()
const { status: plexStatus, refresh: refreshPlexStatus } = usePlexStatus()

// The libraries endpoint is provider-generic; only the shape is shared with Jellyfin.
const libraries = ref<JellyfinLibrary[]>([])
const librariesLoading = ref(true)

const allLibrariesSelected = computed(() => props.plexLibraryAccess === 'all')

async function fetchLibraries() {
  try {
    const res = await $fetch('/api/admin/sync/libraries')
    const data = res as Array<{ name: string; libraries: JellyfinLibrary[] }>
    const plex = data.find((p) => p.name === 'plex')
    libraries.value = plex?.libraries ?? []
  } catch {
    // silently fail
  } finally {
    librariesLoading.value = false
  }
}

function toggleLibraryAccess() {
  if (allLibrariesSelected.value) {
    emit('update:plexLibraryAccess', [])
  } else {
    emit('update:plexLibraryAccess', 'all')
  }
}

function toggleLibrary(libraryId: string) {
  const current = Array.isArray(props.plexLibraryAccess)
    ? [...props.plexLibraryAccess]
    : libraries.value.map((l) => l.id)

  const index = current.indexOf(libraryId)
  if (index >= 0) {
    current.splice(index, 1)
  } else {
    current.push(libraryId)
  }

  emit('update:plexLibraryAccess', current)
}

function isSelected(libraryId: string): boolean {
  return (
    allLibrariesSelected.value ||
    (Array.isArray(props.plexLibraryAccess) && props.plexLibraryAccess.includes(libraryId))
  )
}

onMounted(() => {
  if (props.plexConfigured) {
    void fetchLibraries()
    void refreshPlexStatus()
  } else {
    librariesLoading.value = false
  }
})
</script>

<template>
  <div class="border-t border-zinc-200 dark:border-white/10 pt-4 mt-4">
    <h3 class="text-sm font-semibold text-zinc-900 dark:text-white flex items-center gap-2 mb-4">
      <UIcon name="i-simple-icons-plex" class="w-4 h-4 text-amber-500" />
      Plex
    </h3>

    <MediaServerStatusBanner v-if="plexConfigured" :status="plexStatus" />

    <div v-if="plexConfigured" class="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <div>
        <h4 class="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-2">
          {{ t('admin.plexLibraries') }}
        </h4>
        <div v-if="librariesLoading" class="flex items-center gap-2 text-sm text-zinc-400 py-2">
          <UIcon name="i-lucide-loader-2" class="w-4 h-4 animate-spin" />
          {{ t('admin.loading') }}...
        </div>
        <div v-else-if="libraries.length === 0" class="text-sm text-zinc-400 py-2">
          {{ t('admin.plexNoLibraries') }}
        </div>
        <div v-else class="space-y-2">
          <button
            type="button"
            class="text-xs text-blue-500 hover:text-blue-400 transition-colors"
            @click="toggleLibraryAccess"
          >
            {{ allLibrariesSelected ? t('admin.plexSelectLibraries') : t('admin.plexAllLibraries') }}
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

      <div>
        <h4 class="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-2">
          {{ t('admin.plexPlayback') }}
        </h4>
        <div class="grid grid-cols-1 gap-2">
          <div
            class="p-2.5 rounded-lg bg-zinc-50 dark:bg-white/5 border border-zinc-200 dark:border-white/10 space-y-1"
          >
            <div class="flex items-center justify-between">
              <span class="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                {{ t('admin.plexLiveTvAccess') }}
              </span>
              <USwitch
                :model-value="props.plexEnableLiveTvAccess"
                @update:model-value="emit('update:plexEnableLiveTvAccess', $event)"
              />
            </div>
            <p class="text-xs text-zinc-400">{{ t('admin.plexLiveTvAccessDesc') }}</p>
          </div>

          <div
            class="p-2.5 rounded-lg bg-zinc-50 dark:bg-white/5 border border-zinc-200 dark:border-white/10 space-y-1"
          >
            <div class="flex items-center justify-between">
              <span class="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                {{ t('admin.plexSyncAccess') }}
              </span>
              <USwitch
                :model-value="props.plexEnableSync"
                @update:model-value="emit('update:plexEnableSync', $event)"
              />
            </div>
            <p class="text-xs text-zinc-400">{{ t('admin.plexSyncAccessDesc') }}</p>
          </div>
        </div>
      </div>
    </div>

    <UAlert
      v-else
      color="neutral"
      variant="subtle"
      icon="i-lucide-circle-alert"
      :title="t('admin.plexNotConfigured')"
      :description="t('admin.plexNotConfiguredDesc')"
      class="mt-1"
    />
  </div>
</template>
