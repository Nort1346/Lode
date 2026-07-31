<script setup lang="ts">
const { t } = useI18n()
const toast = useToast()

const loading = ref(true)
const saving = ref(false)

const defaults = reactive({
  dailyDownloadLimit: 5,
  activeTorrentLimit: 3,
  maxTorrentSizeGb: 20,
  privateTrackerLimit: 5,
  maxSessions: 0,
  canSubmit: false
})

async function fetchDefaults() {
  loading.value = true
  try {
    const res = await $fetch('/api/admin/defaults')
    Object.assign(defaults, res)
  } catch {
    // silently fail
  } finally {
    loading.value = false
  }
}

async function saveDefaults() {
  saving.value = true
  try {
    await $fetch('/api/admin/defaults', {
      method: 'PUT',
      body: defaults
    })
    toast.add({ title: t('admin.defaultLimitsSaved'), color: 'success' })
  } catch {
    toast.add({ title: t('admin.defaultLimitsError'), color: 'error' })
  } finally {
    saving.value = false
  }
}

onMounted(() => {
  fetchDefaults()
})
</script>

<template>
  <div class="card p-6 mb-4">
    <div class="flex items-center gap-2 mb-4">
      <UIcon name="i-lucide-users" class="w-5 h-5 text-blue-500" />
      <h3 class="text-lg font-semibold text-zinc-900 dark:text-white">{{ t('admin.defaultLimits') }}</h3>
    </div>

    <div v-if="loading" class="space-y-4">
      <div class="h-4 w-32 rounded bg-zinc-200 dark:bg-zinc-700 animate-pulse" />
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <div
          v-for="i in 6"
          :key="i"
          class="p-3 rounded-lg bg-zinc-50 dark:bg-white/5 border border-zinc-200 dark:border-white/10 space-y-2"
        >
          <div class="flex items-center justify-between">
            <div class="h-4 w-28 rounded bg-zinc-200 dark:bg-zinc-700 animate-pulse" />
            <div class="h-5 w-9 rounded-full bg-zinc-200 dark:bg-zinc-700 animate-pulse" />
          </div>
          <div class="h-3 w-40 rounded bg-zinc-200 dark:bg-zinc-700 animate-pulse" />
        </div>
      </div>
    </div>

    <div v-else class="space-y-4">
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <div class="p-3 rounded-lg bg-zinc-50 dark:bg-white/5 border border-zinc-200 dark:border-white/10 space-y-1">
          <span class="text-sm font-medium text-zinc-700 dark:text-zinc-300">{{ t('admin.defaultDailyLimit') }}</span>
          <UInput v-model.number="defaults.dailyDownloadLimit" type="number" class="mt-1 w-full" />
          <p class="text-xs text-zinc-400">{{ t('admin.defaultDailyLimitDesc') }}</p>
        </div>
        <div class="p-3 rounded-lg bg-zinc-50 dark:bg-white/5 border border-zinc-200 dark:border-white/10 space-y-1">
          <span class="text-sm font-medium text-zinc-700 dark:text-zinc-300">{{ t('admin.defaultActiveLimit') }}</span>
          <UInput v-model.number="defaults.activeTorrentLimit" type="number" class="mt-1 w-full" />
          <p class="text-xs text-zinc-400">{{ t('admin.defaultActiveLimitDesc') }}</p>
        </div>
        <div class="p-3 rounded-lg bg-zinc-50 dark:bg-white/5 border border-zinc-200 dark:border-white/10 space-y-1">
          <span class="text-sm font-medium text-zinc-700 dark:text-zinc-300">{{ t('admin.defaultMaxSize') }}</span>
          <UInput v-model.number="defaults.maxTorrentSizeGb" type="number" class="mt-1 w-full" />
          <p class="text-xs text-zinc-400">{{ t('admin.defaultMaxSizeDesc') }}</p>
        </div>
        <div class="p-3 rounded-lg bg-zinc-50 dark:bg-white/5 border border-zinc-200 dark:border-white/10 space-y-1">
          <span class="text-sm font-medium text-zinc-700 dark:text-zinc-300">{{
            t('admin.defaultPrivateTrackerLimit')
          }}</span>
          <UInput v-model.number="defaults.privateTrackerLimit" type="number" class="mt-1 w-full" />
          <p class="text-xs text-zinc-400">{{ t('admin.defaultPrivateTrackerLimitDesc') }}</p>
        </div>
        <div class="p-3 rounded-lg bg-zinc-50 dark:bg-white/5 border border-zinc-200 dark:border-white/10 space-y-1">
          <span class="text-sm font-medium text-zinc-700 dark:text-zinc-300">{{ t('admin.defaultMaxSessions') }}</span>
          <UInput v-model.number="defaults.maxSessions" type="number" class="mt-1 w-full" />
          <p class="text-xs text-zinc-400">{{ t('admin.defaultMaxSessionsDesc') }}</p>
        </div>
        <div class="p-3 rounded-lg bg-zinc-50 dark:bg-white/5 border border-zinc-200 dark:border-white/10 space-y-1">
          <div class="flex items-center justify-between">
            <span class="text-sm font-medium text-zinc-700 dark:text-zinc-300">{{ t('admin.defaultCanSubmit') }}</span>
            <USwitch v-model="defaults.canSubmit" />
          </div>
          <p class="text-xs text-zinc-400">{{ t('admin.defaultCanSubmitDesc') }}</p>
        </div>
      </div>

      <div class="flex justify-end pt-2">
        <UButton :loading="saving" :label="t('admin.saveChanges')" @click="saveDefaults" />
      </div>
    </div>
  </div>
</template>
