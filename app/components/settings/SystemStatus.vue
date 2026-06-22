<script setup lang="ts">
import type { ServiceStatus } from '~/types/settings'

const { t } = useI18n()

const services = ref<ServiceStatus[]>([])
const loading = ref(true)

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

async function fetchServices() {
  loading.value = true
  try {
    const data = await $fetch<{ services: ServiceStatus[] }>('/api/admin/system-status')
    services.value = data.services
  } catch {
    services.value = []
  } finally {
    loading.value = false
  }
}

onMounted(fetchServices)
</script>

<template>
  <div class="card p-6 mb-4">
    <h2 class="text-lg font-semibold text-zinc-900 dark:text-white mb-4">{{ t('settings.systemStatus') }}</h2>
    <div v-if="loading" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
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
</template>
