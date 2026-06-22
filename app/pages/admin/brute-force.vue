<script setup lang="ts">
import type { BlockedIp, BruteForceConfig, BruteForceStats } from '~/types/admin'

definePageMeta({
  middleware: ['auth', 'admin'],
  layout: 'default'
})

const { t } = useI18n()

const blockedIps = ref<BlockedIp[]>([])
const config = ref<BruteForceConfig>({
  maxAttemptsPerIp: 5,
  ipBlockDurationMinutes: 60,
  windowMinutes: 15
})
const stats = ref<BruteForceStats>({
  blockedIpsCount: 0,
  recentAttempts24h: 0,
  recentFailed24h: 0,
  recentSuccess24h: 0
})

const loading = ref(true)
const savingConfig = ref(false)
const toast = useToast()

async function fetchAll() {
  loading.value = true
  try {
    const [blockedData, configData, statsData] = await Promise.all([
      $fetch<{ blockedIps: BlockedIp[] }>('/api/admin/brute-force/blocked-ips'),
      $fetch<{ config: BruteForceConfig }>('/api/admin/brute-force/config'),
      $fetch<{ stats: BruteForceStats }>('/api/admin/brute-force/stats')
    ])
    blockedIps.value = blockedData.blockedIps
    config.value = configData.config
    stats.value = statsData.stats
  } catch {
    // ignore
  } finally {
    loading.value = false
  }
}

async function unblockIp(ip: string) {
  await $fetch('/api/admin/brute-force/blocked-ips', { method: 'DELETE', body: { ip } })
  toast.add({ title: t('bruteForce.unblocked'), color: 'success' })
  await fetchAll()
}

async function saveConfig() {
  savingConfig.value = true
  try {
    await $fetch('/api/admin/brute-force/config', { method: 'PUT', body: config.value })
    toast.add({ title: t('bruteForce.saved'), color: 'success' })
  } catch {
    toast.add({ title: t('bruteForce.saveError'), color: 'error' })
  } finally {
    savingConfig.value = false
  }
}

function formatExpiry(timestamp: number): string {
  const remaining = Math.max(0, Math.ceil((timestamp - Date.now()) / 60_000))
  if (remaining <= 0) return t('bruteForce.expired')
  return `${remaining} min`
}

onMounted(fetchAll)
</script>

<template>
  <div>
    <div class="mb-8">
      <h1 class="text-3xl font-bold text-zinc-900 dark:text-white mb-2">{{ t('bruteForce.title') }}</h1>
      <p class="text-zinc-500 dark:text-zinc-400">{{ t('bruteForce.subtitle') }}</p>
    </div>

    <div v-if="loading" class="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
      <USkeleton v-for="i in 2" :key="i" class="h-24 rounded-xl" />
    </div>

    <div v-else class="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
      <div class="card p-4">
        <div class="flex items-center gap-3 mb-2">
          <div class="flex justify-center items-center p-2 rounded-lg bg-red-100 dark:bg-red-900/20">
            <UIcon name="i-lucide-shield-off" class="w-5 h-5 text-red-600 dark:text-red-400" />
          </div>
          <div>
            <div class="text-2xl font-bold text-zinc-900 dark:text-white">{{ stats.blockedIpsCount }}</div>
            <div class="text-xs text-zinc-500 dark:text-zinc-400">{{ t('bruteForce.blockedIps') }}</div>
          </div>
        </div>
      </div>
      <div class="card p-4">
        <div class="flex items-center gap-3 mb-2">
          <div class="flex justify-center items-center p-2 rounded-lg bg-blue-100 dark:bg-blue-900/20">
            <UIcon name="i-lucide-clock" class="w-5 h-5 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <div class="text-2xl font-bold text-zinc-900 dark:text-white">{{ stats.recentAttempts24h }}</div>
            <div class="text-xs text-zinc-500 dark:text-zinc-400">{{ t('bruteForce.recentAttempts') }}</div>
          </div>
        </div>
      </div>
    </div>

    <div class="card p-6 mb-6">
      <h2 class="text-lg font-semibold text-zinc-900 dark:text-white mb-4">{{ t('bruteForce.blockedIps') }}</h2>
      <div v-if="blockedIps.length === 0" class="text-sm text-zinc-500 dark:text-zinc-400">
        {{ t('bruteForce.noBlockedIps') }}
      </div>
      <div v-else class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b border-zinc-200 dark:border-white/10">
              <th class="text-left py-2 px-3 text-zinc-500 dark:text-zinc-400 font-medium">IP</th>
              <th class="text-left py-2 px-3 text-zinc-500 dark:text-zinc-400 font-medium">
                {{ t('bruteForce.reason') }}
              </th>
              <th class="text-left py-2 px-3 text-zinc-500 dark:text-zinc-400 font-medium">
                {{ t('bruteForce.expiresAt') }}
              </th>
              <th class="text-right py-2 px-3 text-zinc-500 dark:text-zinc-400 font-medium">
                {{ t('bruteForce.actions') }}
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="entry in blockedIps" :key="entry.ip" class="border-b border-zinc-100 dark:border-white/5">
              <td class="py-2 px-3 font-mono text-zinc-900 dark:text-white">{{ entry.ip }}</td>
              <td class="py-2 px-3 text-zinc-600 dark:text-zinc-300">
                {{ entry.attemptsCount }} {{ t('bruteForce.failedAttempts') }}
              </td>
              <td class="py-2 px-3 text-zinc-600 dark:text-zinc-300">{{ formatExpiry(entry.expiresAt) }}</td>
              <td class="py-2 px-3 text-right">
                <UButton
                  color="error"
                  variant="soft"
                  size="xs"
                  :label="t('bruteForce.unblock')"
                  @click="unblockIp(entry.ip)"
                />
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div class="card p-6">
      <h2 class="text-lg font-semibold text-zinc-900 dark:text-white mb-4">{{ t('bruteForce.settings') }}</h2>
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <label class="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">{{
            t('bruteForce.maxAttemptsPerIp')
          }}</label>
          <UInput v-model.number="config.maxAttemptsPerIp" type="number" :min="1" :max="100" />
        </div>
        <div>
          <label class="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">{{
            t('bruteForce.ipBlockDuration')
          }}</label>
          <UInput v-model.number="config.ipBlockDurationMinutes" type="number" :min="1" :max="1440" />
        </div>
        <div>
          <label class="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">{{
            t('bruteForce.windowMinutes')
          }}</label>
          <UInput v-model.number="config.windowMinutes" type="number" :min="1" :max="1440" />
        </div>
      </div>
      <div class="mt-4 flex items-center gap-3">
        <UButton color="primary" :loading="savingConfig" :label="t('bruteForce.save')" @click="saveConfig" />
      </div>
    </div>
  </div>
</template>
