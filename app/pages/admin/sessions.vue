<script setup lang="ts">
import type { Session, SessionGroup } from '~/types/admin'

definePageMeta({
  middleware: ['auth', 'admin'],
  layout: 'default'
})

const { t } = useI18n()
const toast = useToast()
const { confirm } = useConfirmDialog()

const { user, clear } = useUserSession()

const sessions = ref<Session[]>([])
const loading = ref(true)

async function fetchSessions() {
  loading.value = true
  try {
    const res = await $fetch<Session[]>('/api/admin/sessions')
    sessions.value = res
  } catch {
    // silently fail
  } finally {
    loading.value = false
  }
}

onMounted(fetchSessions)

async function revokeSession(id: string, targetUserId: string) {
  try {
    await $fetch(`/api/admin/sessions/${id}`, { method: 'DELETE' })
    toast.add({ title: t('admin.sessionRevoked'), color: 'success' })
    if (user.value?.id === targetUserId) {
      await clear()
      await navigateTo('/login')
      return
    }
    await fetchSessions()
  } catch {
    toast.add({ title: t('admin.sessionRevokeFailed'), color: 'error' })
  }
}

async function revokeAllForUser(userId: string, username: string) {
  const confirmed = await confirm({
    title: t('common.confirm'),
    description: t('admin.confirmRevokeAll', { username }),
    confirmLabel: t('common.delete'),
    cancelLabel: t('common.cancel')
  })
  if (!confirmed) return
  try {
    await $fetch('/api/admin/sessions/delete-all', { method: 'POST', body: { userId } })
    toast.add({ title: t('admin.sessionsRevoked'), color: 'success' })
    if (user.value?.id === userId) {
      await clear()
      await navigateTo('/login')
      return
    }
    await fetchSessions()
  } catch {
    toast.add({ title: t('admin.sessionRevokeFailed'), color: 'error' })
  }
}

function timeAgo(dateStr: string) {
  const date = new Date(dateStr)
  const now = new Date()
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000)
  if (seconds < 60) return t('time.justNow')
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return t('time.minutesAgo', { n: minutes })
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return t('time.hoursAgo', { n: hours })
  const days = Math.floor(hours / 24)
  return t('time.daysAgo', { n: days })
}

const groupedSessions = computed<SessionGroup[]>(() => {
  const map = new Map<string, SessionGroup>()
  for (const s of sessions.value) {
    const key = s.userId
    const group = map.get(key)
    if (group) {
      group.sessions.push(s)
    } else {
      map.set(key, { username: s.username ?? 'Unknown', role: s.role, avatarUrl: s.avatarUrl, sessions: [s] })
    }
  }
  return Array.from(map.values())
})

function revokeAllGroup(group: SessionGroup) {
  const first = group.sessions[0]
  if (!first) return
  void revokeAllForUser(first.userId, group.username)
}
</script>

<template>
  <div>
    <div v-reveal class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
      <div>
        <h1 class="text-3xl font-bold text-zinc-900 dark:text-white mb-2">{{ t('admin.sessionsTitle') }}</h1>
        <p class="text-zinc-500 dark:text-zinc-400">{{ t('admin.sessionsSubtitle') }}</p>
      </div>
      <UButton icon="i-lucide-refresh-cw" variant="outline" :label="t('admin.refresh')" @click="fetchSessions" />
    </div>

    <div v-if="loading" role="status" aria-busy="true" class="space-y-8">
      <div v-for="g in 2" :key="g" class="card p-6">
        <div class="flex items-center justify-between mb-4">
          <div class="flex items-center gap-3">
            <USkeleton class="h-8 w-8 rounded-full" />
            <USkeleton class="h-4 w-32 rounded" />
          </div>
          <USkeleton class="h-7 w-24 rounded-lg" />
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          <div
            v-for="s in 3"
            :key="s"
            class="rounded-lg border border-zinc-200 dark:border-white/10 p-4 space-y-3"
          >
            <div class="flex items-start justify-between">
              <div class="flex items-center gap-2">
                <USkeleton class="h-4 w-4 rounded" />
                <USkeleton class="h-4 w-28 rounded" />
              </div>
              <USkeleton class="h-6 w-6 rounded-md" />
            </div>
            <div class="space-y-1.5">
              <USkeleton class="h-3 w-24 rounded" />
              <USkeleton class="h-3 w-32 rounded" />
              <USkeleton class="h-3 w-28 rounded" />
            </div>
          </div>
        </div>
      </div>
    </div>

    <div v-else-if="groupedSessions.length === 0" class="text-center py-16 text-zinc-400">
      {{ t('admin.noActiveSessions') }}
    </div>

    <div v-else class="space-y-8">
      <div v-for="group in groupedSessions" :key="group.username" v-reveal="'fade'" class="card p-6">
        <div class="flex items-center justify-between mb-4">
          <div class="flex items-center gap-3">
            <UAvatar :src="group.avatarUrl ?? undefined" :alt="group.username" size="md" />
            <div>
              <span class="text-sm font-semibold text-zinc-900 dark:text-white">{{ group.username }}</span>
              <span
                v-if="group.role === 'admin'"
                class="ml-2 text-xs px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-400"
                >admin</span
              >
            </div>
          </div>
          <UButton
            v-if="group.sessions.length > 1"
            icon="i-lucide-trash-2"
            variant="ghost"
            color="error"
            size="xs"
            :label="t('admin.revokeAll')"
            @click="revokeAllGroup(group)"
          />
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          <div
            v-for="s in group.sessions"
            :key="s.id"
            class="rounded-lg border border-zinc-200 dark:border-white/10 p-4 space-y-2"
          >
            <div class="flex items-start justify-between">
              <div class="flex items-center gap-2">
                <UIcon name="i-lucide-monitor" class="w-4 h-4 text-zinc-400" />
                <span class="text-sm font-medium text-zinc-900 dark:text-white">{{ s.deviceName ?? 'Unknown' }}</span>
              </div>
              <UButton
                icon="i-lucide-x"
                variant="ghost"
                color="error"
                size="xs"
                @click="revokeSession(s.id, s.userId)"
              />
            </div>
            <div class="text-xs text-zinc-500 dark:text-zinc-400 space-y-1">
              <div v-if="s.ip" class="flex items-center gap-1.5">
                <UIcon name="i-lucide-globe" class="w-3 h-3" />
                {{ s.ip }}
              </div>
              <div class="flex items-center gap-1.5">
                <UIcon name="i-lucide-clock" class="w-3 h-3" />
                {{ t('admin.activeAgo') }} {{ timeAgo(s.lastActiveAt) }}
              </div>
              <div class="flex items-center gap-1.5">
                <UIcon name="i-lucide-log-in" class="w-3 h-3" />
                {{ t('admin.loggedIn') }} {{ timeAgo(s.createdAt) }}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
