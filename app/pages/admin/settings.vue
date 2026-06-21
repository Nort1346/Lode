<script setup lang="ts">
definePageMeta({
  middleware: ['auth', 'admin'],
  layout: 'default'
})

const { t } = useI18n()
const { user } = useUserSession()

const envVars = {
  core: [
    { name: 'NUXT_TMDB_API_KEY', desc: 'TMDB API Key' },
    { name: 'NUXT_REDIS_URL', desc: 'Redis URL' },
    { name: 'NUXT_SESSION_PASSWORD', desc: 'Session secret' }
  ],
  integrations: [
    { name: 'NUXT_QUI_PROXY_URL', desc: 'qui Client Proxy' },
    { name: 'NUXT_PROWLARR_URL', desc: 'Prowlarr URL' },
    { name: 'NUXT_PROWLARR_API_KEY', desc: 'Prowlarr API Key' },
    { name: 'NUXT_JELLYFIN_URL', desc: 'Jellyfin URL' },
    { name: 'NUXT_JELLYFIN_API_KEY', desc: 'Jellyfin API Key' },
    { name: 'NUXT_FLARESOLVERR_URL', desc: 'FlareSolverr URL (Cloudflare bypass)' }
  ],
  paths: [
    { name: 'NUXT_SAVE_PATH_MOVIES', desc: '🎬 Movies' },
    { name: 'NUXT_SAVE_PATH_SERIES', desc: '📺 Series' }
  ],
  discord: [{ name: 'NUXT_DISCORD_WEBHOOK_URL', desc: 'Discord Webhook URL' }]
}
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

    <div class="card p-6 mb-4">
      <h2 class="text-lg font-semibold text-zinc-900 dark:text-white mb-2">{{ t('settings.envVars') }}</h2>
      <p class="text-sm text-zinc-500 dark:text-zinc-400 mb-4">{{ t('settings.envVarsDesc') }}</p>

      <div v-for="(category, catKey) in envVars" :key="catKey" class="mb-4 last:mb-0">
        <h3 class="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2 capitalize">
          {{ t(`settings.${catKey}`) }}
        </h3>
        <div class="space-y-1">
          <div
            v-for="v in category"
            :key="v.name"
            class="flex items-center gap-2 p-2 rounded-lg bg-zinc-50 dark:bg-white/3 border border-zinc-100 dark:border-white/5 font-mono text-xs overflow-x-auto"
          >
            <span class="text-zinc-400 dark:text-zinc-500 shrink-0">{{ v.name }}</span>
            <span class="text-zinc-300 dark:text-zinc-600">-</span>
            <span class="text-zinc-500 dark:text-zinc-400 truncate">{{ v.desc }}</span>
          </div>
        </div>
      </div>
    </div>

    <div class="card p-6">
      <h2 class="text-lg font-semibold text-zinc-900 dark:text-white mb-3">{{ t('settings.adminAccount') }}</h2>
      <div class="flex items-center gap-3">
        <UAvatar
          :alt="user?.username?.charAt(0)?.toUpperCase()"
          size="md"
          class="bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300"
        />
        <div>
          <div class="text-sm font-medium text-zinc-900 dark:text-white">{{ user?.username }}</div>
          <div class="text-xs text-zinc-500 dark:text-zinc-400">admin</div>
        </div>
      </div>
    </div>

    <SettingsLiveLogs />
  </div>
</template>
