<script setup lang="ts">
import { NotificationType, BADGE_MAX } from '#server/types/notifications'

defineProps<{ sidebar?: boolean }>()

const { t } = useI18n()
const toast = useToast()
const {
  notifications,
  unreadCount,
  markAsRead,
  markAllAsRead,
  onNewNotification,
  permissionGranted,
  enableNotifications,
  checkPermission
} = useNotifications()

const open = ref(false)
const animateBell = ref(false)
const animateBadge = ref(false)

onNewNotification((n) => {
  playNotificationSound()
  animateBell.value = true
  animateBadge.value = true
  setTimeout(() => {
    animateBell.value = false
  }, 600)
  setTimeout(() => {
    animateBadge.value = false
  }, 400)

  toast.add({
    title: n.title,
    description: n.message,
    color: n.type === NotificationType.REQUEST_REJECTED ? 'error' : 'success'
  })
})

const unreadNotifications = computed(() => notifications.value.filter((n) => !n.read))
const readNotifications = computed(() => notifications.value.filter((n) => n.read))

const notificationSections = computed(() => [
  { label: t('notifications.unread'), items: unreadNotifications.value, showDot: true, animEnter: true },
  { label: t('notifications.read'), items: readNotifications.value, showDot: false, animEnter: false }
])

function handleClick(notification: (typeof notifications.value)[number]) {
  if (!notification.read) {
    markAsRead(notification.id)
  }
  if (notification.link !== null) {
    navigateTo(notification.link)
  }
  open.value = false
}

function closeModal() {
  open.value = false
}

async function handleEnableNotifications() {
  const ok = await enableNotifications()
  if (ok) {
    toast.add({ title: t('notifications.enabled'), color: 'success' })
  } else {
    toast.add({ title: t('notifications.enableError'), color: 'error' })
  }
}

onMounted(() => {
  checkPermission()
})

function formatTime(dateStr: string) {
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

function getTypeBadge(type: string) {
  switch (type) {
    case NotificationType.DOWNLOAD_COMPLETE:
      return { label: t('notifications.badge.download'), color: 'bg-green-500/15 text-green-600 dark:text-green-400' }
    case NotificationType.REQUEST_ACCEPTED:
      return { label: t('notifications.badge.accepted'), color: 'bg-green-500/15 text-green-600 dark:text-green-400' }
    case NotificationType.REQUEST_REJECTED:
      return { label: t('notifications.badge.rejected'), color: 'bg-red-500/15 text-red-600 dark:text-red-400' }
    default:
      return { label: '', color: '' }
  }
}

function getTypeIcon(type: string) {
  switch (type) {
    case NotificationType.DOWNLOAD_COMPLETE:
      return 'i-lucide-download'
    case NotificationType.REQUEST_ACCEPTED:
      return 'i-lucide-check-circle'
    case NotificationType.REQUEST_REJECTED:
      return 'i-lucide-x-circle'
    default:
      return 'i-lucide-bell'
  }
}

function getPosterUrl(n: (typeof notifications.value)[number]): string | null {
  if (n.data !== null && typeof n.data === 'object' && 'posterUrl' in n.data) {
    const url = n.data.posterUrl
    if (typeof url === 'string' && url.length > 0) return url
  }
  return null
}
</script>

<template>
  <!-- Desktop sidebar mode: full-width button like theme toggle -->
  <button
    v-if="sidebar"
    class="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-white/5 transition-all w-full"
    @click="open = true"
  >
    <UIcon name="i-lucide-bell" class="w-5 h-5" :class="{ 'bell-animate': animateBell }" />
    <span>{{ t('notifications.title') }}</span>
    <span
      v-if="unreadCount > 0"
      class="ml-auto inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full text-[10px] font-bold bg-amber-500 text-white"
      :class="{ 'badge-animate': animateBadge }"
    >
      {{ unreadCount > BADGE_MAX ? `${BADGE_MAX}+` : unreadCount }}
    </span>
  </button>

  <!-- Mobile mode: icon-only with animation -->
  <button
    v-else
    class="relative flex items-center justify-center p-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-white/5 text-zinc-600 dark:text-zinc-400"
    @click="open = true"
  >
    <UIcon name="i-lucide-bell" class="w-5 h-5" :class="{ 'bell-animate': animateBell }" />
    <span
      v-if="unreadCount > 0"
      class="absolute -top-0.5 -right-0.5 inline-flex items-center justify-center min-w-4 h-4 px-1 rounded-full text-[9px] font-bold bg-amber-500 text-white"
      :class="{ 'badge-animate': animateBadge }"
    >
      {{ unreadCount > BADGE_MAX ? `${BADGE_MAX}+` : unreadCount }}
    </span>
  </button>

  <!-- Modal -->
  <Teleport to="body">
    <Transition
      enter-active-class="duration-200 ease-out"
      leave-active-class="duration-150 ease-in"
      enter-from-class="opacity-0"
      enter-to-class="opacity-100"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <div v-if="open" class="fixed inset-0 z-50 flex items-center justify-center p-4">
        <!-- Backdrop -->
        <div class="absolute inset-0 bg-black/50 dark:bg-black/70 backdrop-blur-sm" @click="closeModal" />

        <!-- Panel -->
        <div
          class="relative w-full max-w-lg max-h-[80vh] bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-white/10 rounded-xl shadow-2xl overflow-hidden flex flex-col dropdown-animate"
        >
          <!-- Header -->
          <div class="flex items-center justify-between px-5 py-4 border-b border-zinc-200 dark:border-white/10">
            <div class="flex items-center gap-2">
              <UIcon name="i-lucide-bell" class="w-5 h-5 text-amber-500" />
              <h3 class="text-base font-semibold text-zinc-900 dark:text-white">{{ t('notifications.title') }}</h3>
              <span
                v-if="unreadCount > 0"
                class="inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full text-[10px] font-bold bg-amber-500 text-white"
              >
                {{ unreadCount > BADGE_MAX ? `${BADGE_MAX}+` : unreadCount }}
              </span>
            </div>
            <div class="flex items-center gap-2">
              <UButton
                v-if="unreadCount > 0"
                variant="ghost"
                color="neutral"
                size="xs"
                :label="t('notifications.markAllRead')"
                @click="markAllAsRead"
              />
              <button
                class="flex items-center justify-center w-7 h-7 rounded-lg text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-white/5 transition-colors"
                @click="closeModal"
              >
                <UIcon name="i-lucide-x" class="w-4 h-4" />
              </button>
            </div>
          </div>

          <!-- Notification list -->
          <div class="flex-1 overflow-y-auto">
            <!-- Enable button — always visible when permission not granted -->
            <div
              v-if="!permissionGranted"
              class="px-5 py-4 border-b border-zinc-100 dark:border-white/5 bg-amber-50 dark:bg-amber-500/5"
            >
              <div class="flex items-center gap-3">
                <UIcon name="i-lucide-bell-off" class="w-5 h-5 text-amber-500 flex-shrink-0" />
                <div class="flex-1 min-w-0">
                  <p class="text-sm font-medium text-zinc-900 dark:text-white">{{ t('notifications.enableHint') }}</p>
                </div>
                <UButton
                  color="primary"
                  variant="solid"
                  size="xs"
                  icon="i-lucide-bell"
                  :label="t('notifications.enable')"
                  @click="handleEnableNotifications"
                />
              </div>
            </div>

            <!-- Empty state -->
            <div v-if="notifications.length === 0" class="px-5 py-16 text-center">
              <UIcon name="i-lucide-bell-off" class="w-12 h-12 mx-auto mb-3 text-zinc-300 dark:text-zinc-600" />
              <p class="text-sm text-zinc-400">{{ t('notifications.empty') }}</p>
            </div>

            <template v-else>
              <template v-for="(section, sIdx) in notificationSections" :key="sIdx">
                <template v-if="section.items.length > 0">
                  <div
                    v-if="sIdx > 0 || section.showDot"
                    class="px-5 py-2 text-[10px] font-semibold uppercase tracking-wider"
                    :class="
                      section.showDot
                        ? 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/5'
                        : 'text-zinc-400 dark:text-zinc-500 bg-zinc-50 dark:bg-white/[0.02]'
                    "
                  >
                    {{ section.label }} ({{ section.items.length }})
                  </div>
                  <button
                    v-for="n in section.items"
                    :key="n.id"
                    class="w-full flex items-start gap-3 px-5 py-3 text-left hover:bg-zinc-50 dark:hover:bg-white/5 transition-colors border-b border-zinc-100 dark:border-white/5"
                    :class="{ 'notif-enter': section.animEnter, 'opacity-60': !section.showDot }"
                    @click="handleClick(n)"
                  >
                    <div class="w-10 h-14 rounded-lg overflow-hidden flex-shrink-0 bg-zinc-100 dark:bg-white/5">
                      <img
                        v-if="getPosterUrl(n) !== null"
                        :src="getPosterUrl(n)"
                        :alt="n.title"
                        class="w-full h-full object-cover"
                      />
                      <div v-else class="w-full h-full flex items-center justify-center">
                        <UIcon :name="getTypeIcon(n.type)" class="w-4 h-4 text-zinc-400 dark:text-zinc-500" />
                      </div>
                    </div>
                    <div class="flex-1 min-w-0">
                      <p class="text-sm font-medium text-zinc-900 dark:text-white truncate">{{ n.title }}</p>
                      <p v-if="n.message" class="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5 line-clamp-2">
                        {{ n.message }}
                      </p>
                      <div class="flex items-center gap-2 mt-1.5">
                        <span class="text-[10px] text-zinc-400 dark:text-zinc-500">{{ formatTime(n.createdAt) }}</span>
                        <span
                          v-if="getTypeBadge(n.type).label"
                          class="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-medium"
                          :class="getTypeBadge(n.type).color"
                        >
                          {{ getTypeBadge(n.type).label }}
                        </span>
                      </div>
                    </div>
                    <div v-if="section.showDot" class="w-2 h-2 rounded-full bg-amber-500 mt-2 flex-shrink-0" />
                  </button>
                </template>
              </template>
            </template>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
