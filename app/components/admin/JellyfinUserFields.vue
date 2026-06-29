<script setup lang="ts">
import type { JellyfinLibrary } from '~/types/admin'
import type { JellyfinUserFieldsProps } from '~/types/sync'

const props = withDefaults(defineProps<JellyfinUserFieldsProps>(), {
  editing: false,
  avatarUrl: null,
  username: ''
})

const emit = defineEmits<{
  'update:jellyfinLibraryAccess': [value: string[] | 'all']
  'update:jellyfinEnableVideoTranscoding': [value: boolean]
  'update:jellyfinEnableAudioTranscoding': [value: boolean]
  'update:jellyfinEnableRemuxing': [value: boolean]
  'update:jellyfinEnableLiveTvAccess': [value: boolean]
  'update:jellyfinEnableLiveTvManagement': [value: boolean]
  'update:jellyfinMaxActiveSessions': [value: number]
  'update:avatar': [file: File | null]
  'update:avatarRemoved': [value: boolean]
}>()

const { t } = useI18n()

const libraries = ref<JellyfinLibrary[]>([])
const librariesLoading = ref(true)
const avatarPreview = ref<string | null>(null)
const fileInputRef = ref<HTMLInputElement | null>(null)
const avatarRemoved = ref(false)

const allLibrariesSelected = computed(() => props.jellyfinLibraryAccess === 'all')

const hasAvatar = computed(() => avatarPreview.value !== null || (props.avatarUrl !== null && !avatarRemoved.value))

const displayAvatarSrc = computed(() => {
  if (avatarRemoved.value) return undefined
  return avatarPreview.value ?? props.avatarUrl ?? undefined
})

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

function toggleLibraryAccess() {
  if (allLibrariesSelected.value) {
    emit(
      'update:jellyfinLibraryAccess',
      libraries.value.map((l) => l.id)
    )
  } else {
    emit('update:jellyfinLibraryAccess', 'all')
  }
}

function toggleLibrary(libraryId: string) {
  const current = Array.isArray(props.jellyfinLibraryAccess) ? [...props.jellyfinLibraryAccess] : []

  const index = current.indexOf(libraryId)
  if (index >= 0) {
    current.splice(index, 1)
  } else {
    current.push(libraryId)
  }

  emit('update:jellyfinLibraryAccess', current.length === 0 ? 'all' : current)
}

function isSelected(libraryId: string): boolean {
  return (
    allLibrariesSelected.value ||
    (Array.isArray(props.jellyfinLibraryAccess) && props.jellyfinLibraryAccess.includes(libraryId))
  )
}

function triggerFileInput() {
  fileInputRef.value?.click()
}

function onAvatarChange(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (file) {
    avatarPreview.value = URL.createObjectURL(file)
    avatarRemoved.value = false
    emit('update:avatar', file)
    emit('update:avatarRemoved', false)
  }
}

function removeAvatar() {
  avatarPreview.value = null
  avatarRemoved.value = true
  emit('update:avatar', null)
  emit('update:avatarRemoved', true)
  if (fileInputRef.value) {
    fileInputRef.value.value = ''
  }
}

onMounted(fetchLibraries)
</script>

<template>
  <div class="border-t border-zinc-200 dark:border-white/10 pt-4 mt-4">
    <h3 class="text-sm font-semibold text-zinc-900 dark:text-white flex items-center gap-2 mb-4">
      <UIcon name="i-lucide-tv" class="w-4 h-4 text-blue-500" />
      Jellyfin
    </h3>

    <div class="grid grid-cols-1 lg:grid-cols-[auto_1fr_1fr] gap-4">
      <div class="flex flex-col items-center gap-3 lg:w-[140px]">
        <button
          type="button"
          class="shrink-0 rounded-full overflow-hidden ring-2 ring-zinc-200 dark:ring-white/10 hover:ring-blue-400 dark:hover:ring-blue-500 transition-all cursor-pointer focus:outline-none focus:ring-blue-500"
          @click="triggerFileInput"
        >
          <UAvatar :src="displayAvatarSrc" :alt="props.username" size="3xl" />
        </button>
        <input
          ref="fileInputRef"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          class="hidden"
          @change="onAvatarChange"
        />
        <div class="text-center">
          <p class="text-xs text-zinc-400">{{ t('admin.jellyfinAvatarDesc') }}</p>
          <div class="flex items-center justify-center gap-2 mt-1.5">
            <UButton
              variant="outline"
              size="xs"
              icon="i-lucide-upload"
              :label="t('admin.jellyfinAvatarUpload')"
              @click="triggerFileInput"
            />
            <UButton
              v-if="hasAvatar"
              variant="ghost"
              size="xs"
              icon="i-lucide-x"
              color="error"
              :label="t('admin.jellyfinAvatarRemove')"
              @click="removeAvatar"
            />
          </div>
        </div>
      </div>

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

      <div>
        <h4 class="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-2">
          {{ t('admin.jellyfinPlayback') }}
        </h4>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div
            class="p-2.5 rounded-lg bg-zinc-50 dark:bg-white/5 border border-zinc-200 dark:border-white/10 space-y-1"
          >
            <div class="flex items-center justify-between">
              <span class="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                {{ t('admin.jellyfinVideoTranscoding') }}
              </span>
              <USwitch
                :model-value="props.jellyfinEnableVideoTranscoding"
                @update:model-value="emit('update:jellyfinEnableVideoTranscoding', $event)"
              />
            </div>
            <p class="text-xs text-zinc-400">{{ t('admin.jellyfinVideoTranscodingDesc') }}</p>
          </div>

          <div
            class="p-2.5 rounded-lg bg-zinc-50 dark:bg-white/5 border border-zinc-200 dark:border-white/10 space-y-1"
          >
            <div class="flex items-center justify-between">
              <span class="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                {{ t('admin.jellyfinAudioTranscoding') }}
              </span>
              <USwitch
                :model-value="props.jellyfinEnableAudioTranscoding"
                @update:model-value="emit('update:jellyfinEnableAudioTranscoding', $event)"
              />
            </div>
            <p class="text-xs text-zinc-400">{{ t('admin.jellyfinAudioTranscodingDesc') }}</p>
          </div>

          <div
            class="p-2.5 rounded-lg bg-zinc-50 dark:bg-white/5 border border-zinc-200 dark:border-white/10 space-y-1"
          >
            <div class="flex items-center justify-between">
              <span class="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                {{ t('admin.jellyfinRemuxing') }}
              </span>
              <USwitch
                :model-value="props.jellyfinEnableRemuxing"
                @update:model-value="emit('update:jellyfinEnableRemuxing', $event)"
              />
            </div>
            <p class="text-xs text-zinc-400">{{ t('admin.jellyfinRemuxingDesc') }}</p>
          </div>

          <div
            class="p-2.5 rounded-lg bg-zinc-50 dark:bg-white/5 border border-zinc-200 dark:border-white/10 space-y-1"
          >
            <div class="flex items-center justify-between">
              <span class="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                {{ t('admin.jellyfinLiveTvAccess') }}
              </span>
              <USwitch
                :model-value="props.jellyfinEnableLiveTvAccess"
                @update:model-value="emit('update:jellyfinEnableLiveTvAccess', $event)"
              />
            </div>
            <p class="text-xs text-zinc-400">{{ t('admin.jellyfinLiveTvAccessDesc') }}</p>
          </div>

          <div
            class="p-2.5 rounded-lg bg-zinc-50 dark:bg-white/5 border border-zinc-200 dark:border-white/10 space-y-1"
          >
            <div class="flex items-center justify-between">
              <span class="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                {{ t('admin.jellyfinLiveTvManagement') }}
              </span>
              <USwitch
                :model-value="props.jellyfinEnableLiveTvManagement"
                @update:model-value="emit('update:jellyfinEnableLiveTvManagement', $event)"
              />
            </div>
            <p class="text-xs text-zinc-400">{{ t('admin.jellyfinLiveTvManagementDesc') }}</p>
          </div>

          <div
            class="p-2.5 rounded-lg bg-zinc-50 dark:bg-white/5 border border-zinc-200 dark:border-white/10 space-y-1"
          >
            <span class="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              {{ t('admin.jellyfinMaxSessions') }}
            </span>
            <UInput
              :model-value="props.jellyfinMaxActiveSessions"
              type="number"
              :min="0"
              class="w-full mt-1"
              :placeholder="t('admin.jellyfinMaxSessionsPlaceholder')"
              @update:model-value="emit('update:jellyfinMaxActiveSessions', Number($event))"
            />
            <p class="text-xs text-zinc-400">{{ t('admin.jellyfinMaxSessionsDesc') }}</p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
