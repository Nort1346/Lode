<script setup lang="ts">
import { mapApiError } from '~/types/api'

definePageMeta({
  middleware: ['auth', 'submit'],
  layout: 'default'
})

const { user } = useUserSession()
const { t } = useI18n()
const toast = useToast()

const inputMode = ref<'magnet' | 'file' | 'url'>('magnet')
const form = reactive({
  magnetLink: '',
  torrentUrl: '',
  savePath: '',
  label: ''
})
const selectedFile = ref<File | null>(null)
const loading = ref(false)
const { active: downloadActive, startDownload, finishDownload } = useDownloadOverlay()

const CATEGORY_I18N: Record<string, string> = {
  movies: 'common.savePath_movies',
  series: 'common.savePath_series',
  games: 'common.savePath_games',
  music: 'common.savePath_music',
  books: 'common.savePath_books'
}

const { data: availableCategories } = useFetch<string[]>('/api/categories')

const savePathOptions = computed(() =>
  (availableCategories.value ?? []).map((key) => ({
    label: t(CATEGORY_I18N[key] ?? key),
    value: key
  }))
)

watch(availableCategories, (cats) => {
  if (!cats || cats.length === 0) return
  const first = cats[0]
  if (first === undefined) return
  if (!cats.includes(form.savePath)) {
    form.savePath = first
  }
})

const inputModeOptions = computed(() => [
  { label: t('submit.inputModeMagnet'), value: 'magnet' },
  { label: t('submit.inputModeUrl'), value: 'url' },
  { label: t('submit.inputModeFile'), value: 'file' }
])

function onFileChange(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0] ?? null
  if (file && !file.name.endsWith('.torrent')) {
    toast.add({ title: t('submit.invalidFileType'), color: 'error' })
    input.value = ''
    return
  }
  if (file && file.size > 5 * 1024 * 1024) {
    toast.add({ title: t('submit.fileTooLarge'), color: 'error' })
    input.value = ''
    return
  }
  selectedFile.value = file
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      const base64 = result.split(',')[1] ?? ''
      resolve(base64)
    }
    reader.onerror = () => reject(new Error('Failed to read file'))
    reader.readAsDataURL(file)
  })
}

async function handleSubmit() {
  if (loading.value) return
  loading.value = true
  startDownload(form.label || t('download.adding'))

  try {
    if (inputMode.value === 'magnet') {
      await $fetch('/api/torrents/add', {
        method: 'POST',
        body: {
          magnetLink: form.magnetLink.trim(),
          savePath: form.savePath,
          label: form.label.trim()
        }
      })
    } else if (inputMode.value === 'url') {
      await $fetch('/api/torrents/add', {
        method: 'POST',
        body: {
          downloadUrl: form.torrentUrl.trim(),
          savePath: form.savePath,
          label: form.label.trim()
        }
      })
    } else {
      if (!selectedFile.value) {
        toast.add({ title: t('submit.selectFile'), color: 'error' })
        loading.value = false
        finishDownload()
        return
      }
      const torrentFile = await fileToBase64(selectedFile.value)
      await $fetch('/api/torrents/add', {
        method: 'POST',
        body: {
          torrentFile,
          fileName: selectedFile.value.name,
          savePath: form.savePath,
          label: form.label.trim()
        }
      })
      selectedFile.value = null
    }

    toast.add({ title: t('submit.success'), color: 'success' })
    navigateTo('/dashboard/downloads')
  } catch (e: unknown) {
    const err = mapApiError(e)
    const statusCode =
      (e as { data?: { statusCode?: number }; statusCode?: number })?.data?.statusCode ??
      (e as { statusCode?: number })?.statusCode
    if (statusCode === 507) {
      toast.add({ title: t('download.diskFull'), description: err.data?.statusMessage, color: 'warning' })
    } else {
      toast.add({ title: err.data?.statusMessage || t('submit.failed'), color: 'error' })
    }
  } finally {
    loading.value = false
    finishDownload()
  }
}
</script>

<template>
  <div class="max-w-2xl">
    <div v-reveal class="mb-8">
      <h1 class="text-3xl font-bold text-zinc-900 dark:text-white mb-2">{{ t('submit.title') }}</h1>
      <p class="text-zinc-500 dark:text-zinc-400">{{ t('submit.subtitle') }}</p>
    </div>

    <div v-reveal="1" class="card p-6">
      <form @submit.prevent="handleSubmit">
        <div class="space-y-4">
          <UFormField :label="t('submit.labelLabel')" :description="t('submit.labelDesc')">
            <UInput v-model="form.label" :placeholder="t('submit.labelPlaceholder')" class="w-full" />
          </UFormField>

          <UFormField :label="t('submit.inputMethod')">
            <USelect v-model="inputMode" :items="inputModeOptions" class="w-full" />
          </UFormField>

          <UFormField
            v-if="inputMode === 'magnet'"
            :label="t('submit.magnetLabel')"
            :description="t('submit.magnetDesc')"
          >
            <UTextarea
              v-model="form.magnetLink"
              :placeholder="t('submit.magnetPlaceholder')"
              :rows="3"
              class="w-full"
            />
          </UFormField>

          <UFormField v-else-if="inputMode === 'url'" :label="t('submit.urlLabel')" :description="t('submit.urlDesc')">
            <UTextarea v-model="form.torrentUrl" :placeholder="t('submit.urlPlaceholder')" :rows="3" class="w-full" />
          </UFormField>

          <UFormField v-else :label="t('submit.fileLabel')" :description="t('submit.fileDesc')">
            <div
              class="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-lg cursor-pointer transition-colors"
              :class="[
                selectedFile
                  ? 'border-green-500 bg-green-50 dark:bg-green-900/20'
                  : 'border-zinc-300 dark:border-zinc-600 hover:border-amber-500 dark:hover:border-amber-400 bg-zinc-50 dark:bg-zinc-800'
              ]"
              @click="($refs.fileInput as HTMLInputElement).click()"
            >
              <input ref="fileInput" type="file" accept=".torrent" class="hidden" @change="onFileChange" />
              <div v-if="selectedFile" class="text-center">
                <UIcon name="i-lucide-file-check" class="w-8 h-8 text-green-600 dark:text-green-400 mx-auto mb-1" />
                <p class="text-sm font-medium text-green-700 dark:text-green-300">{{ selectedFile.name }}</p>
                <p class="text-xs text-green-600 dark:text-green-400">{{ (selectedFile.size / 1024).toFixed(1) }} KB</p>
              </div>
              <div v-else class="text-center">
                <UIcon name="i-lucide-upload" class="w-8 h-8 text-zinc-400 mx-auto mb-1" />
                <p class="text-sm text-zinc-500 dark:text-zinc-400">{{ t('submit.filePlaceholder') }}</p>
                <p class="text-xs text-zinc-400 dark:text-zinc-500">{{ t('submit.fileHint') }}</p>
              </div>
            </div>
          </UFormField>

          <UFormField :label="t('submit.saveToLabel')" :description="t('submit.saveToDesc')">
            <USelect v-model="form.savePath" :items="savePathOptions" class="w-full" />
          </UFormField>

          <div class="info-box p-4 text-sm text-zinc-500 dark:text-zinc-400">
            <div class="flex items-center gap-2 mb-1">
              <UIcon name="i-lucide-info" class="w-4 h-4 text-amber-600 dark:text-amber-400" />
              <span class="font-medium text-zinc-900 dark:text-white">{{ t('submit.limitsTitle') }}</span>
            </div>
            <ul class="space-y-1 ml-6">
              <li>
                {{ t('submit.maxSize') }}
                <span class="text-zinc-900 dark:text-white">{{ user?.maxTorrentSizeGb }}GB</span>
              </li>
              <li>
                {{ t('submit.dailyDownloads') }}
                <span class="text-zinc-900 dark:text-white"
                  >{{ user?.downloadsToday }} / {{ user?.dailyDownloadLimit }}</span
                >
              </li>
              <li>
                {{ t('submit.activeTorrents') }}
                <span class="text-zinc-900 dark:text-white">{{ user?.activeTorrentLimit }} max</span>
              </li>
            </ul>
          </div>

          <UButton
            type="submit"
            color="primary"
            variant="solid"
            size="lg"
            class="w-full justify-center"
            :loading="loading"
            :disabled="downloadActive"
            icon="i-lucide-download"
            :label="t('submit.addButton')"
          />
        </div>
      </form>
    </div>
  </div>
</template>
