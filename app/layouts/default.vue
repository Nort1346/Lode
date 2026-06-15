<script setup lang="ts">
definePageMeta({
  middleware: 'auth'
})

const { user, clear } = useUserSession()
const route = useRoute()
const colorMode = useColorMode()

const mobileOpen = ref(false)

const isAdmin = computed(() => user.value?.role === 'admin')

const navigation = computed(() => {
  const items = [
    { label: 'Dashboard', icon: 'i-lucide-layout-dashboard', to: '/dashboard' },
    {
      label: 'Browse',
      icon: 'i-lucide-film',
      to: '/browse'
    },
    {
      label: 'Submit Torrent',
      icon: 'i-lucide-plus-circle',
      to: '/dashboard/submit'
    },
    {
      label: 'My Downloads',
      icon: 'i-lucide-download',
      to: '/dashboard/downloads'
    }
  ]

  if (isAdmin.value) {
    items.push(
      { label: 'User Management', icon: 'i-lucide-users', to: '/admin/users' },
      { label: 'Activity Logs', icon: 'i-lucide-activity', to: '/admin/logs' },
      {
        label: 'Admin Settings',
        icon: 'i-lucide-settings',
        to: '/admin/settings'
      }
    )
  }

  return items
})

function toggleTheme() {
  colorMode.preference = colorMode.value === 'dark' ? 'light' : 'dark'
}

const isDark = computed(() => colorMode.value === 'dark')

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
      <button
        class="flex items-center justify-center p-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-white/5 text-zinc-600 dark:text-zinc-400"
        @click="toggleTheme"
      >
        <UIcon :name="isDark ? 'i-lucide-sun' : 'i-lucide-moon'" class="w-5 h-5" />
      </button>
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
          <div class="flex items-center gap-3 px-3 mb-3">
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
          <UButton
            variant="ghost"
            color="neutral"
            icon="i-lucide-log-out"
            label="Sign Out"
            class="w-full justify-start"
            @click="handleLogout"
          />
        </div>
      </div>
    </div>

    <!-- Desktop sidebar -->
    <aside class="hidden md:flex sidebar w-64 p-4 flex-col fixed h-full">
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
        <button
          class="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-white/5 transition-all w-full"
          @click="toggleTheme"
        >
          <UIcon :name="isDark ? 'i-lucide-sun' : 'i-lucide-moon'" class="w-5 h-5" />
          {{ isDark ? 'Light Mode' : 'Dark Mode' }}
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
        <UButton
          variant="ghost"
          color="neutral"
          icon="i-lucide-log-out"
          label="Sign Out"
          class="w-full justify-start"
          @click="handleLogout"
        />
      </div>
    </aside>

    <!-- Main content -->
    <main class="flex-1 md:ml-64 p-4 md:p-6">
      <slot />
    </main>

    <!-- Footer -->
    <footer class="footer py-4 text-center text-xs text-zinc-400 dark:text-zinc-600">&copy; Nort</footer>
  </div>
</template>
