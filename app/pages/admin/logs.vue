<script setup lang="ts">
interface ActivityLog {
  id: string
  userId: string | null
  username: string | null
  action: string
  details: string | null
  ip: string | null
  userAgent: string | null
  createdAt: string
}

definePageMeta({
  middleware: ['auth', 'admin'],
  layout: 'default'
})

const logs = ref<ActivityLog[]>([])
const loading = ref(true)
const page = ref(1)
const totalPages = ref(1)
const total = ref(0)
const filterAction = ref('')
const filterUserId = ref('')
const limit = 50

const ACTION_LABELS: Record<string, string> = {
  login: 'Login',
  login_failed: 'Login Failed',
  logout: 'Logout',
  register: 'Register',
  torrent_add: 'Torrent Add',
  torrent_delete: 'Torrent Delete',
  user_update: 'User Update',
  user_delete: 'User Delete'
}

const ACTION_COLORS: Record<string, string> = {
  login: 'green',
  login_failed: 'red',
  logout: 'zinc',
  register: 'blue',
  torrent_add: 'blue',
  torrent_delete: 'orange',
  user_update: 'amber',
  user_delete: 'red'
}

const ACTION_OPTIONS = Object.entries(ACTION_LABELS).map(([value, label]) => ({ value, label }))

async function fetchLogs() {
  loading.value = true
  try {
    const params = new URLSearchParams()
    params.set('page', String(page.value))
    params.set('limit', String(limit))
    if (filterAction.value) params.set('action', filterAction.value)
    if (filterUserId.value) params.set('userId', filterUserId.value)

    const res = await $fetch<{ logs: ActivityLog[]; page: number; totalPages: number; total: number }>(
      `/api/admin/logs?${params.toString()}`
    )
    logs.value = res.logs
    page.value = res.page
    totalPages.value = res.totalPages
    total.value = res.total
  } catch {
    // silently fail
  } finally {
    loading.value = false
  }
}

onMounted(fetchLogs)

function applyFilters() {
  page.value = 1
  fetchLogs()
}

function nextPage() {
  if (page.value < totalPages.value) {
    page.value++
    fetchLogs()
  }
}

function prevPage() {
  if (page.value > 1) {
    page.value--
    fetchLogs()
  }
}

function formatTime(dateStr: string): string {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleString()
}

function formatDetails(raw: string | null): string {
  if (!raw) return '—'
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
  return ACTION_LABELS[action] ?? action
}

function shortenUA(ua: string | null): string {
  if (!ua) return '—'
  if (ua.length > 60) return ua.substring(0, 60) + '…'
  return ua
}
</script>

<template>
  <div>
    <div class="mb-8">
      <h1 class="text-3xl font-bold text-zinc-900 dark:text-white mb-2">Activity Logs</h1>
      <p class="text-zinc-500 dark:text-zinc-400">Track user actions, logins, and torrent activity</p>
    </div>

    <div class="card p-5 mb-6">
      <div class="flex flex-col sm:flex-row gap-3">
        <USelect v-model="filterAction" :items="ACTION_OPTIONS" placeholder="All actions" class="w-full sm:w-48" />
        <UInput v-model="filterUserId" placeholder="Filter by user ID" class="w-full sm:w-48" />
        <UButton label="Apply" icon="i-lucide-search" @click="applyFilters" />
      </div>
    </div>

    <div v-if="loading" class="flex justify-center py-16">
      <UIcon name="i-lucide-loader-2" class="w-8 h-8 text-amber-500 dark:text-amber-400 animate-spin" />
    </div>

    <div v-else-if="logs.length === 0" class="card p-12 text-center">
      <UIcon name="i-lucide-inbox" class="w-12 h-12 text-zinc-300 dark:text-zinc-600 mx-auto mb-4" />
      <p class="text-zinc-500 dark:text-zinc-400">No logs found</p>
    </div>

    <div v-else class="card overflow-hidden">
      <div class="overflow-x-auto">
        <table class="w-full">
          <thead>
            <tr class="table-header">
              <th class="px-4 py-3 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase">Time</th>
              <th class="px-4 py-3 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase">User</th>
              <th class="px-4 py-3 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase">Action</th>
              <th
                class="px-4 py-3 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase hidden lg:table-cell"
              >
                Details
              </th>
              <th
                class="px-4 py-3 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase hidden md:table-cell"
              >
                IP
              </th>
              <th
                class="px-4 py-3 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase hidden xl:table-cell"
              >
                User Agent
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
                  {{ log.username ?? '—' }}
                </span>
              </td>
              <td class="px-4 py-3">
                <span
                  class="text-xs font-medium px-2 py-1 rounded-full"
                  :class="`bg-${actionColor(log.action)}-500/15 text-${actionColor(log.action)}-700 dark:text-${actionColor(log.action)}-400`"
                >
                  {{ actionLabel(log.action) }}
                </span>
              </td>
              <td class="px-4 py-3 text-sm text-zinc-500 dark:text-zinc-400 hidden lg:table-cell max-w-xs truncate">
                {{ formatDetails(log.details) }}
              </td>
              <td class="px-4 py-3 text-sm text-zinc-500 dark:text-zinc-400 hidden md:table-cell font-mono">
                {{ log.ip ?? '—' }}
              </td>
              <td class="px-4 py-3 text-sm text-zinc-500 dark:text-zinc-400 hidden xl:table-cell">
                {{ shortenUA(log.userAgent) }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="flex items-center justify-between px-4 py-3 border-t border-zinc-200 dark:border-white/5">
        <span class="text-sm text-zinc-500 dark:text-zinc-400">
          Page {{ page }} of {{ totalPages }} ({{ total }} total)
        </span>
        <div class="flex gap-2">
          <UButton label="Previous" variant="soft" :disabled="page <= 1" @click="prevPage" />
          <UButton label="Next" variant="soft" :disabled="page >= totalPages" @click="nextPage" />
        </div>
      </div>
    </div>
  </div>
</template>
