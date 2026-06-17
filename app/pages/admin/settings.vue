<script setup lang="ts">
interface ServiceStatus {
  name: string
  configured: boolean
  status: 'up' | 'down' | 'not_configured'
  latencyMs?: number
  details?: string
}

definePageMeta({
  middleware: ['auth', 'admin'],
  layout: 'default'
})

const { t } = useI18n()
const { user } = useUserSession()

const services = ref<ServiceStatus[]>([])
const loadingServices = ref(true)
const discordLocale = ref('pl')

interface DiskStatus {
  path: string
  totalBytes: number
  freeBytes: number
  usedBytes: number
  totalFormatted: string
  freeFormatted: string
  usedFormatted: string
  usedPercent: number
  hasEnoughSpace: boolean
  available: boolean
}

const diskStatuses = ref<DiskStatus[]>([])
const loadingDisks = ref(true)
const diskMinFreeGb = ref(7)
const diskCheckEnabled = ref(true)

const serviceIcons: Record<string, string> = {
  qBittorrent: 'i-lucide-download',
  Prowlarr: 'i-lucide-search',
  Jellyfin: 'i-lucide-play',
  Redis: 'i-lucide-database',
  Discord: 'i-lucide-message-square',
  FlareSolverr: 'i-lucide-shield'
}

const serviceColors: Record<string, string> = {
  qBittorrent: 'text-blue-600 dark:text-blue-400',
  Prowlarr: 'text-purple-600 dark:text-purple-400',
  Jellyfin: 'text-pink-600 dark:text-pink-400',
  Redis: 'text-red-600 dark:text-red-400',
  Discord: 'text-indigo-600 dark:text-indigo-400',
  FlareSolverr: 'text-orange-600 dark:text-orange-400'
}

const statusColors: Record<string, string> = {
  up: 'bg-green-500',
  down: 'bg-red-500',
  not_configured: 'bg-zinc-400 dark:bg-zinc-600'
}

const statusTextColors: Record<string, string> = {
  up: 'text-green-600 dark:text-green-400',
  down: 'text-red-600 dark:text-red-400',
  not_configured: 'text-zinc-500 dark:text-zinc-400'
}

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
  trackers: [
    { name: 'NUXT_TRACKER_DEVIL_ENABLED', desc: 'Devil-Torrents' },
    { name: 'NUXT_TRACKER_DEVIL_COOKIE', desc: 'Devil-Torrents Cookie' },
    { name: 'NUXT_TRACKER_POLSKIE_ENABLED', desc: 'Polskie-Torrenty' },
    { name: 'NUXT_TRACKER_POLSKIE_COOKIE', desc: 'Polskie-Torrenty Cookie' }
  ],
  discord: [{ name: 'NUXT_DISCORD_WEBHOOK_URL', desc: 'Discord Webhook URL' }]
}

async function fetchStatus() {
  loadingServices.value = true
  loadingDisks.value = true
  try {
    const [statusData, localeData, diskData] = await Promise.all([
      $fetch<{ services: ServiceStatus[] }>('/api/admin/system-status'),
      $fetch<{ locale: string }>('/api/admin/discord-locale'),
      $fetch<{ disks: DiskStatus[]; minFreeSpaceGb: number; checkEnabled: boolean }>('/api/admin/disk-status')
    ])
    services.value = statusData.services
    discordLocale.value = localeData.locale
    diskStatuses.value = diskData.disks
    diskMinFreeGb.value = diskData.minFreeSpaceGb
    diskCheckEnabled.value = diskData.checkEnabled
  } catch {
    services.value = []
  } finally {
    loadingServices.value = false
    loadingDisks.value = false
  }
}

async function changeDiscordLocale(newLocale: string) {
  const valid = newLocale === 'pl' || newLocale === 'en' ? newLocale : 'pl'
  discordLocale.value = valid
  await $fetch('/api/admin/discord-locale', { method: 'PUT', body: { locale: valid } })
}

onMounted(fetchStatus)
</script>

<template>
  <div>
    <div class="mb-8">
      <h1 class="text-3xl font-bold text-zinc-900 dark:text-white mb-2">{{ t('settings.title') }}</h1>
      <p class="text-zinc-500 dark:text-zinc-400">{{ t('settings.subtitle') }}</p>
    </div>

    <div class="mb-6">
      <h2 class="text-lg font-semibold text-zinc-900 dark:text-white mb-4">{{ t('settings.systemStatus') }}</h2>
      <div v-if="loadingServices" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <USkeleton v-for="i in 6" :key="i" class="h-24 rounded-xl" />
      </div>
      <div v-else class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <div v-for="s in services" :key="s.name" class="card p-4">
          <div class="flex items-center gap-3 mb-3">
            <div class="flex justify-center items-center p-2 rounded-lg bg-zinc-100 dark:bg-white/5">
              <UIcon :name="serviceIcons[s.name] ?? 'i-lucide-circle'" class="w-5 h-5" :class="serviceColors[s.name]" />
            </div>
            <div class="flex-1 min-w-0">
              <div class="text-sm font-medium text-zinc-900 dark:text-white truncate">{{ s.name }}</div>
              <div v-if="s.details" class="text-xs text-zinc-500 dark:text-zinc-400">{{ s.details }}</div>
            </div>
          </div>
          <div class="flex items-center gap-2">
            <span class="size-2 rounded-full" :class="statusColors[s.status]" />
            <span class="text-xs font-medium" :class="statusTextColors[s.status]">
              {{
                s.status === 'up'
                  ? t('settings.serviceUp')
                  : s.status === 'down'
                    ? t('settings.serviceDown')
                    : t('settings.notConfigured')
              }}
            </span>
            <span v-if="s.latencyMs != null" class="ml-auto text-xs text-zinc-400 dark:text-zinc-500">
              {{ s.latencyMs }}{{ t('settings.ms') }}
            </span>
          </div>
        </div>
      </div>
    </div>

    <div class="card p-6 mb-4">
      <h2 class="text-lg font-semibold text-zinc-900 dark:text-white mb-4">{{ t('settings.discordTitle') }}</h2>
      <p class="text-sm text-zinc-500 dark:text-zinc-400 mb-4">{{ t('settings.discordDesc') }}</p>
      <div class="space-y-4">
        <div>
          <label class="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">{{
            t('settings.discordLocale')
          }}</label>
          <USelect
            :model-value="discordLocale"
            :items="[
              { label: 'Polski', value: 'pl' },
              { label: 'English', value: 'en' }
            ]"
            @update:model-value="changeDiscordLocale"
          />
          <p class="text-xs text-zinc-400 dark:text-zinc-500 mt-4">{{ t('settings.discordLocaleDesc') }}</p>
        </div>
      </div>
    </div>

    <div class="card p-6 mb-4">
      <h2 class="text-lg font-semibold text-zinc-900 dark:text-white mb-4">{{ t('settings.diskStatus') }}</h2>
      <p class="text-sm text-zinc-500 dark:text-zinc-400 mb-4">{{ t('settings.diskStatusDesc') }}</p>
      <div v-if="loadingDisks" class="space-y-3">
        <USkeleton v-for="i in 2" :key="i" class="h-20 w-full rounded-xl" />
      </div>
      <div v-else-if="diskStatuses.length === 0" class="text-sm text-zinc-500 dark:text-zinc-400">
        {{ t('settings.notConfigured') }} — NUXT_DISKS
      </div>
      <div v-else class="space-y-4">
        <div class="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400 mb-3">
          <UIcon
            :name="diskCheckEnabled ? 'i-lucide-check-circle' : 'i-lucide-x-circle'"
            class="size-4"
            :class="diskCheckEnabled ? 'text-green-500' : 'text-zinc-400'"
          />
          {{ t('settings.diskMinRequired') }}: {{ diskMinFreeGb }} GB
        </div>
        <div v-for="disk in diskStatuses" :key="disk.path" class="space-y-2">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <span class="text-sm font-medium text-zinc-900 dark:text-white">{{ disk.path }}</span>
              <span
                v-if="!disk.available"
                class="rounded-full bg-red-500/10 px-2 py-0.5 text-xs font-medium text-red-600 dark:text-red-400"
              >
                {{ t('settings.diskUnavailable') }}
              </span>
              <span
                v-else-if="!disk.hasEnoughSpace"
                class="rounded-full bg-red-500/10 px-2 py-0.5 text-xs font-medium text-red-600 dark:text-red-400"
              >
                {{ t('settings.diskLow') }}
              </span>
              <span
                v-else
                class="rounded-full bg-green-500/10 px-2 py-0.5 text-xs font-medium text-green-600 dark:text-green-400"
              >
                {{ t('settings.diskOk') }}
              </span>
            </div>
            <span class="text-xs text-zinc-500 dark:text-zinc-400">
              {{ t('settings.diskFree') }}: {{ disk.freeFormatted }} / {{ t('settings.diskTotal') }}:
              {{ disk.totalFormatted }}
            </span>
          </div>
          <UProgress
            :model-value="disk.usedPercent"
            :color="!disk.available ? 'neutral' : disk.hasEnoughSpace ? 'primary' : 'error'"
            size="sm"
          />
        </div>
      </div>
    </div>

    <div class="card p-6 mb-4">
      <p class="text-sm text-zinc-500 dark:text-zinc-400 mb-4">{{ t('settings.userLimitsDesc') }}</p>
      <div class="space-y-2 text-sm">
        <div class="flex items-center gap-2 text-zinc-600 dark:text-zinc-300">
          <UIcon name="i-lucide-check" class="w-4 h-4 text-amber-500" />
          {{ t('settings.dailyDownloadLimit') }} — 5
        </div>
        <div class="flex items-center gap-2 text-zinc-600 dark:text-zinc-300">
          <UIcon name="i-lucide-check" class="w-4 h-4 text-amber-500" />
          {{ t('settings.activeTorrentLimit') }} — 3
        </div>
        <div class="flex items-center gap-2 text-zinc-600 dark:text-zinc-300">
          <UIcon name="i-lucide-check" class="w-4 h-4 text-amber-500" />
          {{ t('settings.maxTorrentSize') }} — 20 GB
        </div>
        <div class="flex items-center gap-2 text-zinc-600 dark:text-zinc-300">
          <UIcon name="i-lucide-check" class="w-4 h-4 text-amber-500" />
          {{ t('settings.privateTrackerLimit') }} — 5
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
            <span class="text-zinc-300 dark:text-zinc-600">—</span>
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
  </div>
</template>
