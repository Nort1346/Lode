<script setup lang="ts">
definePageMeta({
  middleware: 'auth',
  layout: 'default'
})

const { user } = useUserSession()
const { t } = useI18n()

const form = reactive({
  magnetLink: '',
  savePath: 'movies',
  label: ''
})
const loading = ref(false)
const error = ref('')
const success = ref(false)

const savePathOptions = computed(() => [
  { label: t('common.savePath_movies'), value: 'movies' },
  { label: t('common.savePath_series'), value: 'series' },
  { label: t('common.savePath_games'), value: 'games' },
  { label: t('common.savePath_music'), value: 'music' },
  { label: t('common.savePath_books'), value: 'books' }
])

async function handleSubmit() {
  loading.value = true
  error.value = ''
  success.value = false

  try {
    await $fetch('/api/torrents/add', {
      method: 'POST',
      body: {
        magnetLink: form.magnetLink.trim(),
        savePath: form.savePath,
        label: form.label.trim()
      }
    })

    success.value = true
    form.magnetLink = ''
    form.label = ''
    setTimeout(() => {
      success.value = false
    }, 3000)
  } catch (e: unknown) {
    const err = e as { data?: { statusMessage?: string } }
    error.value = err.data?.statusMessage || t('submit.failed')
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="max-w-2xl">
    <div class="mb-8">
      <h1 class="text-3xl font-bold text-zinc-900 dark:text-white mb-2">{{ t('submit.title') }}</h1>
      <p class="text-zinc-500 dark:text-zinc-400">{{ t('submit.subtitle') }}</p>
    </div>

    <div class="card p-6">
      <form @submit.prevent="handleSubmit">
        <div class="space-y-4">
          <UFormField :label="t('submit.labelLabel')" :description="t('submit.labelDesc')">
            <UInput v-model="form.label" :placeholder="t('submit.labelPlaceholder')" class="w-full" />
          </UFormField>

          <UFormField :label="t('submit.magnetLabel')" :description="t('submit.magnetDesc')">
            <UTextarea
              v-model="form.magnetLink"
              :placeholder="t('submit.magnetPlaceholder')"
              :rows="3"
              class="w-full"
            />
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

          <UAlert v-if="error" :description="error" color="error" variant="subtle" />

          <UAlert v-if="success" :description="t('submit.success')" color="success" variant="subtle" />

          <UButton
            type="submit"
            color="primary"
            variant="solid"
            size="lg"
            class="w-full justify-center"
            :loading="loading"
            icon="i-lucide-download"
            :label="t('submit.addButton')"
          />
        </div>
      </form>
    </div>
  </div>
</template>
