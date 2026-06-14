<script setup lang="ts">
definePageMeta({
  middleware: 'auth',
  layout: 'default'
})

const { user } = useUserSession()

const form = reactive({
  magnetLink: '',
  savePath: 'movies',
  label: ''
})
const loading = ref(false)
const error = ref('')
const success = ref(false)

const savePathOptions = [
  { label: '🎬 Movies', value: 'movies' },
  { label: '📺 Series', value: 'series' },
  { label: '🎮 Games', value: 'games' },
  { label: '🎵 Music', value: 'music' },
  { label: '📚 Books', value: 'books' }
]

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
    error.value = err.data?.statusMessage || 'Failed to add torrent'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="max-w-2xl">
    <div class="mb-8">
      <h1 class="text-3xl font-bold text-zinc-900 dark:text-white mb-2">Submit Torrent</h1>
      <p class="text-zinc-500 dark:text-zinc-400">Add a new torrent using a magnet link</p>
    </div>

    <div class="card p-6">
      <form @submit.prevent="handleSubmit">
        <div class="space-y-4">
          <UFormField label="Label" description="Give it a name so you know what it is">
            <UInput v-model="form.label" placeholder="e.g. The Matrix 1999, Avatar" class="w-full" />
          </UFormField>

          <UFormField label="Magnet Link" description="Paste a magnet:?xt=... link">
            <UTextarea v-model="form.magnetLink" placeholder="magnet:?xt=urn:btih:..." :rows="3" class="w-full" />
          </UFormField>

          <UFormField label="Save To" description="Choose the destination category">
            <USelect v-model="form.savePath" :items="savePathOptions" class="w-full" />
          </UFormField>

          <div class="info-box p-4 text-sm text-zinc-500 dark:text-zinc-400">
            <div class="flex items-center gap-2 mb-1">
              <UIcon name="i-lucide-info" class="w-4 h-4 text-amber-600 dark:text-amber-400" />
              <span class="font-medium text-zinc-900 dark:text-white">Limits</span>
            </div>
            <ul class="space-y-1 ml-6">
              <li>
                Max torrent size: <span class="text-zinc-900 dark:text-white">{{ user?.maxTorrentSizeGb }}GB</span>
              </li>
              <li>
                Daily downloads:
                <span class="text-zinc-900 dark:text-white"
                  >{{ user?.downloadsToday }} / {{ user?.dailyDownloadLimit }}</span
                >
              </li>
              <li>
                Active torrents: <span class="text-zinc-900 dark:text-white">{{ user?.activeTorrentLimit }} max</span>
              </li>
            </ul>
          </div>

          <UAlert v-if="error" :description="error" color="error" variant="subtle" />

          <UAlert v-if="success" description="Torrent added successfully!" color="success" variant="subtle" />

          <UButton
            type="submit"
            color="primary"
            variant="solid"
            size="lg"
            class="w-full justify-center"
            :loading="loading"
            icon="i-lucide-download"
            label="Add Torrent"
          />
        </div>
      </form>
    </div>
  </div>
</template>
