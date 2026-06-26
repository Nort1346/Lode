<script setup lang="ts">
definePageMeta({
  middleware: 'auth'
})

const { user, clear } = useUserSession()
const route = useRoute()
const colorMode = useColorMode()
const { t, locale, locales, setLocale } = useI18n()

const { connect, disconnect, checkPermission, permissionGranted, subscribeToPush } = useNotifications()

const { data: me } = useFetch('/api/user/me')

const mobileOpen = ref(false)

const isAdmin = computed(() => user.value?.role === 'admin')
const canSubmit = computed(() => me.value?.canSubmit === true || isAdmin.value)

const localeOptions = computed(() =>
  (locales.value as Array<{ code: string; name: string }>).map((l) => ({
    label: l.name,
    value: l.code
  }))
)

const navigation = computed(() => {
  const items = [
    { label: t('nav.dashboard'), icon: 'i-lucide-layout-dashboard', to: '/dashboard' },
    { label: t('nav.browse'), icon: 'i-lucide-film', to: '/browse' },
    { label: t('nav.downloads'), icon: 'i-lucide-download', to: '/dashboard/downloads' },
    { label: t('nav.wishlist'), icon: 'i-lucide-heart', to: '/dashboard/wishlist' }
  ]

  if (canSubmit.value) {
    items.splice(2, 0, { label: t('nav.submit'), icon: 'i-lucide-plus-circle', to: '/dashboard/submit' })
  }

  if (isAdmin.value) {
    items.push(
      { label: t('nav.requests'), icon: 'i-lucide-message-square', to: '/admin/requests' },
      { label: t('nav.users'), icon: 'i-lucide-users', to: '/admin/users' },
      { label: t('nav.trackers'), icon: 'i-lucide-satellite-dish', to: '/admin/trackers' },
      { label: t('nav.ranking'), icon: 'i-lucide-sliders-horizontal', to: '/admin/ranking' },
      { label: t('nav.bruteForce'), icon: 'i-lucide-shield', to: '/admin/brute-force' },
      { label: t('nav.sessions'), icon: 'i-lucide-monitor', to: '/admin/sessions' },
      { label: t('nav.logs'), icon: 'i-lucide-activity', to: '/admin/logs' },
      { label: t('nav.settings'), icon: 'i-lucide-settings', to: '/admin/settings' }
    )
  }

  return items
})

function toggleTheme() {
  colorMode.preference = colorMode.value === 'dark' ? 'light' : 'dark'
}

const isDark = computed(() => colorMode.value === 'dark')

onMounted(() => {
  connect()
  checkPermission()
  if (permissionGranted.value) {
    void subscribeToPush()
  }

  const redirect = route.query.redirect
  if (typeof redirect === 'string' && redirect.length > 0 && redirect.startsWith('/') && !redirect.startsWith('//')) {
    navigateTo(redirect, { replace: true })
  }
})

onUnmounted(() => {
  disconnect()
})

async function handleLogout() {
  await $fetch('/api/auth/logout', { method: 'POST' })
  await clear()
  navigateTo('/login')
}

watch(
  () => route.path,
  () => {
    mobileOpen.value = false
  }
)
</script>

<template>
  <div class="bg-main min-h-screen flex flex-col">
    <!-- Mobile header -->
    <div
      class="md:hidden flex items-center justify-between px-4 py-3 border-b border-zinc-200 dark:border-white/8 bg-white dark:bg-zinc-900/80 backdrop-blur-md sticky top-0 z-30"
    >
      <button
        class="flex items-center justify-center p-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-white/5 text-zinc-600 dark:text-zinc-400"
        @click="mobileOpen = true"
      >
        <UIcon name="i-lucide-menu" class="w-5 h-5" />
      </button>
      <NuxtLink to="/dashboard" class="text-lg font-bold text-gradient">StreamHub</NuxtLink>
      <div class="flex items-center gap-1">
        <NotificationDropdown />
        <button
          class="flex items-center justify-center p-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-white/5 text-zinc-600 dark:text-zinc-400"
          @click="toggleTheme"
        >
          <UIcon :name="isDark ? 'i-lucide-sun' : 'i-lucide-moon'" class="w-5 h-5" />
        </button>
      </div>
    </div>

    <!-- Mobile overlay -->
    <div v-if="mobileOpen" class="mobile-overlay md:hidden" @click="mobileOpen = false" />

    <!-- Mobile sidebar -->
    <div class="mobile-sidebar sidebar md:hidden" :class="{ open: mobileOpen }">
      <div class="p-4">
        <div class="flex items-center justify-between mb-6">
          <NuxtLink to="/dashboard" class="text-lg font-bold text-gradient">StreamHub</NuxtLink>
          <button
            class="flex items-center justify-center p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-white/5 text-zinc-500"
            @click="mobileOpen = false"
          >
            <UIcon name="i-lucide-x" class="w-5 h-5" />
          </button>
        </div>

        <nav class="space-y-1">
          <NuxtLink
            v-for="item in navigation"
            :key="item.to"
            :to="item.to"
            class="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150"
            :class="
              route.path === item.to || (item.to !== '/dashboard' && route.path.startsWith(item.to))
                ? 'nav-link-active'
                : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-white/5'
            "
          >
            <UIcon :name="item.icon" class="w-5 h-5" />
            {{ item.label }}
          </NuxtLink>
        </nav>

        <div class="border-t border-zinc-200 dark:border-white/8 pt-4 mt-4">
          <div class="flex items-center gap-3 px-3 mb-2">
            <UAvatar :alt="user?.username" size="sm" />
            <div class="flex-1 min-w-0">
              <p class="text-sm font-medium text-zinc-900 dark:text-white truncate">
                {{ user?.username }}
              </p>
              <p class="text-xs text-zinc-500 dark:text-zinc-400">
                {{ user?.role }}
              </p>
            </div>
          </div>
          <div class="flex items-center gap-3 px-3 mb-2">
            <USelect
              :model-value="locale"
              :items="localeOptions"
              size="xs"
              class="flex-1"
              @update:model-value="setLocale($event as 'pl' | 'en')"
            />
          </div>
          <UButton
            variant="ghost"
            color="neutral"
            icon="i-lucide-log-out"
            :label="t('auth.signOut')"
            class="w-full justify-start"
            @click="handleLogout"
          />
        </div>
      </div>
    </div>

    <!-- Desktop sidebar -->
    <aside class="hidden md:flex sidebar w-64 p-4 flex-col fixed h-full z-20">
      <div class="mb-6 px-2">
        <NuxtLink to="/dashboard" class="text-xl font-bold text-gradient">StreamHub</NuxtLink>
      </div>

      <nav class="flex-1 space-y-1">
        <NuxtLink
          v-for="item in navigation"
          :key="item.to"
          :to="item.to"
          class="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150"
          :class="
            route.path === item.to || (item.to !== '/dashboard' && route.path.startsWith(item.to))
              ? 'nav-link-active'
              : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-white/5'
          "
        >
          <UIcon :name="item.icon" class="w-5 h-5" />
          {{ item.label }}
        </NuxtLink>
      </nav>

      <div class="border-t border-zinc-200 dark:border-white/8 pt-4 mt-4 space-y-3">
        <NotificationDropdown :sidebar="true" />

        <button
          class="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-white/5 transition-all w-full"
          @click="toggleTheme"
        >
          <UIcon :name="isDark ? 'i-lucide-sun' : 'i-lucide-moon'" class="w-5 h-5" />
          {{ isDark ? t('theme.light') : t('theme.dark') }}
        </button>

        <div class="flex items-center gap-3 px-3">
          <UAvatar :alt="user?.username" size="sm" />
          <div class="flex-1 min-w-0">
            <p class="text-sm font-medium text-zinc-900 dark:text-white truncate">
              {{ user?.username }}
            </p>
            <p class="text-xs text-zinc-500 dark:text-zinc-400">
              {{ user?.role }}
            </p>
          </div>
        </div>
        <div class="flex items-center gap-3 px-3">
          <USelect
            :model-value="locale"
            :items="localeOptions"
            size="xs"
            class="flex-1"
            @update:model-value="setLocale($event as 'pl' | 'en')"
          />
        </div>
        <UButton
          variant="ghost"
          color="neutral"
          icon="i-lucide-log-out"
          :label="t('auth.signOut')"
          class="w-full justify-start"
          @click="handleLogout"
        />
      </div>
    </aside>

    <!-- Main content -->
    <main class="flex-1 md:ml-64 p-4 md:p-6">
      <slot />
      <PwaInstallPrompt />
      <PwaIOSInstallBanner />
    </main>

    <!-- Footer -->
    <footer class="footer py-4 text-center text-xs text-zinc-400 dark:text-zinc-600">&copy; Nort</footer>
  </div>
</template>
