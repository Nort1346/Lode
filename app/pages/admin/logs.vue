<script setup lang="ts">
import type { ActivityLog } from '~/types/admin'

definePageMeta({
  middleware: ['auth', 'admin'],
  layout: 'default'
})

const { t } = useI18n()
const { smallerThan } = useBreakpoints()
const logs = ref<ActivityLog[]>([])
const loading = ref(true)
const page = ref(1)
const totalPages = ref(1)
const total = ref(0)
const filterAction = ref('all')
const filterUserId = ref('all')
const limit = 50
const users = ref<{ id: string; username: string }[]>([])

const ACTION_KEYS: Record<string, string> = {
  login: 'action_login',
  login_failed: 'action_login_failed',
  logout: 'action_logout',
  register: 'action_register',
  torrent_add: 'action_torrent_add',
  torrent_delete: 'action_torrent_delete',
  user_update: 'action_user_update',
  user_delete: 'action_user_delete',
  user_password_change: 'action_user_password_change',
  user_force_sync: 'action_user_force_sync',
  tracker_add: 'action_tracker_add',
  tracker_update: 'action_tracker_update',
  tracker_delete: 'action_tracker_delete',
  brute_force_config_update: 'action_brute_force_config_update',
  brute_force_unblock_ip: 'action_brute_force_unblock_ip',
  discord_mentions_update: 'action_discord_mentions_update',
  disk_config_update: 'action_disk_config_update',
  ranking_config_update: 'action_ranking_config_update',
  ranking_config_reset: 'action_ranking_config_reset',
  prep_config_update: 'action_prep_config_update',
  qbit_config_update: 'action_qbit_config_update'
}

const ACTION_COLORS: Record<string, string> = {
  login: 'green',
  login_failed: 'red',
  logout: 'zinc',
  register: 'blue',
  torrent_add: 'blue',
  torrent_delete: 'orange',
  user_update: 'amber',
  user_delete: 'red',
  user_password_change: 'amber',
  user_force_sync: 'red',
  tracker_add: 'cyan',
  tracker_update: 'amber',
  tracker_delete: 'red',
  brute_force_config_update: 'amber',
  brute_force_unblock_ip: 'green',
  discord_mentions_update: 'indigo',
  disk_config_update: 'cyan',
  ranking_config_update: 'violet',
  ranking_config_reset: 'orange',
  prep_config_update: 'teal',
  qbit_config_update: 'cyan'
}

// Full literal class strings: Tailwind JIT cannot generate dynamically composed class names
const ACTION_BADGE_CLASSES: Record<string, string> = {
  green: 'bg-green-500/15 text-green-700 dark:text-green-400',
  red: 'bg-red-500/15 text-red-700 dark:text-red-400',
  zinc: 'bg-zinc-500/15 text-zinc-700 dark:text-zinc-400',
  blue: 'bg-blue-500/15 text-blue-700 dark:text-blue-400',
  orange: 'bg-orange-500/15 text-orange-700 dark:text-orange-400',
  amber: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
  cyan: 'bg-cyan-500/15 text-cyan-700 dark:text-cyan-400',
  indigo: 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-400',
  violet: 'bg-violet-500/15 text-violet-700 dark:text-violet-400',
  teal: 'bg-teal-500/15 text-teal-700 dark:text-teal-400'
}

const ACTION_OPTIONS = computed(() => [
  { value: 'all', label: t('logs.allActions') },
  ...Object.entries(ACTION_KEYS).map(([value, key]) => ({
    value,
    label: t(`logs.${key}`)
  }))
])

let fetchInFlight = false

async function fetchLogs() {
  // applyFilters() sets page = 1 (watch fetches) and also calls fetchLogs() directly -
  // the guard ensures exactly one request goes out
  if (fetchInFlight) return
  fetchInFlight = true
  loading.value = true
  try {
    const params = new URLSearchParams()
    params.set('page', String(page.value))
    params.set('limit', String(limit))
    if (filterAction.value !== 'all') params.set('action', filterAction.value)
    if (filterUserId.value !== 'all') params.set('userId', filterUserId.value)

    const res = await $fetch<{ logs: ActivityLog[]; page: number; totalPages: number; total: number }>(
      `/api/admin/logs?${params.toString()}`
    )
    logs.value = res.logs
    totalPages.value = res.totalPages
    total.value = res.total
  } catch {
    // silently fail
  } finally {
    fetchInFlight = false
    loading.value = false
  }
}

onMounted(async () => {
  await fetchLogs()
  try {
    users.value = await $fetch('/api/admin/users')
  } catch {
    // silently fail
  }
})

watch(page, () => fetchLogs())

const USER_OPTIONS = computed(() => [
  { value: 'all', label: t('logs.allUsers') },
  ...users.value.map((u) => ({ value: u.id, label: u.username }))
])

function applyFilters() {
  page.value = 1
  void fetchLogs()
}

function formatTime(dateStr: string): string {
  if (!dateStr) return '-'
  return new Date(dateStr).toLocaleString()
}

function formatDetails(raw: string | null): string {
  if (raw === null || raw === '') return '-'
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>
    return Object.entries(parsed)
      .map(([k, v]) => `${k}: ${String(v)}`)
      .join(', ')
  } catch {
    return raw
  }
}

function actionColor(action: string): string {
  return ACTION_COLORS[action] ?? 'zinc'
}

function actionLabel(action: string): string {
  const key = ACTION_KEYS[action]
  return key !== undefined && key !== '' ? t(`logs.${key}`) : action
}

function shortenUA(ua: string | null): string {
  if (ua === null || ua === '') return '-'
  if (ua.length > 60) return ua.substring(0, 60) + '…'
  return ua
}

const { copyToClipboard } = useCopyToClipboard()
</script>

<template>
  <div>
    <div v-reveal class="mb-8">
      <h1 class="text-3xl font-bold text-zinc-900 dark:text-white mb-2">{{ t('logs.title') }}</h1>
      <p class="text-zinc-500 dark:text-zinc-400">{{ t('logs.subtitle') }}</p>
    </div>

    <div v-reveal="'fade'" class="card p-5 mb-6">
      <div class="flex flex-col sm:flex-row gap-3">
        <USelect
          v-model="filterAction"
          :items="ACTION_OPTIONS"
          :placeholder="t('logs.allActions')"
          class="w-full sm:w-48"
        />
        <USelect
          v-model="filterUserId"
          :items="USER_OPTIONS"
          :placeholder="t('logs.allUsers')"
          class="w-full sm:w-48"
        />
        <UButton :label="t('logs.apply')" icon="i-lucide-search" @click="applyFilters" />
      </div>
    </div>

    <div v-if="loading" class="flex justify-center py-16">
      <UIcon name="i-lucide-loader-2" class="w-8 h-8 text-amber-500 dark:text-amber-400 animate-spin" />
    </div>

    <div v-else-if="logs.length === 0" v-reveal="'fade'" class="card p-12 text-center">
      <UIcon name="i-lucide-inbox" class="w-12 h-12 text-zinc-300 dark:text-zinc-600 mx-auto mb-4" />
      <p class="text-zinc-500 dark:text-zinc-400">{{ t('logs.noLogs') }}</p>
    </div>

    <div v-else v-reveal="'fade'" class="card overflow-hidden">
      <div class="overflow-x-auto">
        <table class="w-full">
          <thead>
            <tr class="table-header">
              <th class="px-4 py-3 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase">
                {{ t('logs.tableTime') }}
              </th>
              <th class="px-4 py-3 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase">
                {{ t('logs.tableUser') }}
              </th>
              <th
                class="px-4 py-3 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase min-w-[180px]"
              >
                {{ t('logs.tableAction') }}
              </th>
              <th
                class="px-4 py-3 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase hidden lg:table-cell"
              >
                {{ t('logs.tableDetails') }}
              </th>
              <th
                class="px-4 py-3 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase hidden md:table-cell"
              >
                {{ t('logs.tableIP') }}
              </th>
              <th
                class="px-4 py-3 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase hidden xl:table-cell"
              >
                {{ t('logs.tableUA') }}
              </th>
            </tr>
          </thead>
          <tbody class="divide-y divide-zinc-200 dark:divide-white/5">
            <tr v-for="log in logs" :key="log.id" class="table-row">
              <td class="px-4 py-3 text-sm text-zinc-600 dark:text-zinc-300 whitespace-nowrap">
                {{ formatTime(log.createdAt) }}
              </td>
              <td class="px-4 py-3">
                <span class="text-sm font-medium text-zinc-900 dark:text-white">
                  {{ log.username ?? '-' }}
                </span>
              </td>
              <td class="px-4 py-3 min-w-[180px]">
                <span
                  class="text-xs font-medium px-2 py-1 rounded-full"
                  :class="ACTION_BADGE_CLASSES[actionColor(log.action)]"
                >
                  {{ actionLabel(log.action) }}
                </span>
              </td>
              <td
                class="px-4 py-3 text-sm text-zinc-500 dark:text-zinc-400 hidden lg:table-cell max-w-xs truncate cursor-pointer hover:text-zinc-900 dark:hover:text-white"
                @click="copyToClipboard(log.details ?? '')"
              >
                {{ formatDetails(log.details) }}
              </td>
              <td
                class="px-4 py-3 text-sm text-zinc-500 dark:text-zinc-400 hidden md:table-cell font-mono cursor-pointer hover:text-zinc-900 dark:hover:text-white"
                @click="copyToClipboard(log.ip ?? '')"
              >
                {{ log.ip ?? '-' }}
              </td>
              <td
                class="px-4 py-3 text-sm text-zinc-500 dark:text-zinc-400 hidden xl:table-cell cursor-pointer hover:text-zinc-900 dark:hover:text-white"
                @click="copyToClipboard(log.userAgent ?? '')"
              >
                {{ shortenUA(log.userAgent) }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div
        v-if="total > limit"
        class="overflow-x-auto max-w-full flex justify-center px-2 sm:px-4 py-3 border-t border-zinc-200 dark:border-white/5"
      >
        <UPagination
          v-model:page="page"
          :total="total"
          :items-per-page="limit"
          :sibling-count="smallerThan('sm') ? 0 : 1"
          :show-edges="!smallerThan('sm')"
        />
      </div>
    </div>
  </div>
</template>
