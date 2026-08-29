<script setup lang="ts">
definePageMeta({
  middleware: ['auth', 'admin'],
  layout: 'default'
})

const { t } = useI18n()
</script>

<template>
  <div>
    <div v-reveal class="mb-8">
      <h1 class="text-3xl font-bold text-zinc-900 dark:text-white mb-2">{{ t('settings.title') }}</h1>
      <p class="text-zinc-500 dark:text-zinc-400">{{ t('settings.subtitle') }}</p>
    </div>

    <SettingsSystemStatus v-reveal />

    <SettingsDiscordWebhook v-reveal />

    <SettingsDiskStatus v-reveal />

    <SettingsPrepCountdown v-reveal />

    <SettingsQbittorrent v-reveal />

    <SettingsDefaultLimits v-reveal />

    <SettingsSyncProviders v-reveal />

    <SettingsLiveLogs v-reveal />
  </div>
</template>
