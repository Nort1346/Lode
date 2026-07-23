<script setup lang="ts">
definePageMeta({
  middleware: ['auth', 'admin'],
  layout: 'default'
})

const { t } = useI18n()
</script>

<template>
  <div>
    <div class="mb-8">
      <h1 class="text-3xl font-bold text-zinc-900 dark:text-white mb-2">{{ t('settings.title') }}</h1>
      <p class="text-zinc-500 dark:text-zinc-400">{{ t('settings.subtitle') }}</p>
    </div>

    <SettingsSystemStatus />

    <SettingsDiscordWebhook />

    <SettingsDiskStatus />

    <SettingsPrepCountdown />

    <SettingsSyncProviders />

    <div class="card p-6 mb-4">
      <p class="text-sm text-zinc-500 dark:text-zinc-400 mb-4">{{ t('settings.userLimitsDesc') }}</p>
      <div class="space-y-2 text-sm">
        <div class="flex items-center gap-2 text-zinc-600 dark:text-zinc-300">
          <UIcon name="i-lucide-check" class="w-4 h-4 text-amber-500" />
          {{ t('settings.dailyDownloadLimit') }} - 5
        </div>
        <div class="flex items-center gap-2 text-zinc-600 dark:text-zinc-300">
          <UIcon name="i-lucide-check" class="w-4 h-4 text-amber-500" />
          {{ t('settings.activeTorrentLimit') }} - 3
        </div>
        <div class="flex items-center gap-2 text-zinc-600 dark:text-zinc-300">
          <UIcon name="i-lucide-check" class="w-4 h-4 text-amber-500" />
          {{ t('settings.maxTorrentSize') }} - 20 GB
        </div>
        <div class="flex items-center gap-2 text-zinc-600 dark:text-zinc-300">
          <UIcon name="i-lucide-check" class="w-4 h-4 text-amber-500" />
          {{ t('settings.privateTrackerLimit') }} - 5
        </div>
      </div>
      <UButton to="/admin/users" color="warning" variant="soft" icon="i-lucide-users" class="mt-4">
        {{ t('settings.manageUsers') }}
      </UButton>
    </div>

    <SettingsLiveLogs />
  </div>
</template>
