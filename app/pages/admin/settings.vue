<script setup lang="ts">
definePageMeta({
  middleware: ['auth', 'admin'],
  layout: 'default'
})

const { user } = useUserSession()
const { t } = useI18n()
</script>

<template>
  <div>
    <div class="mb-8">
      <h1 class="text-3xl font-bold text-zinc-900 dark:text-white mb-2">{{ t('settings.title') }}</h1>
      <p class="text-zinc-500 dark:text-zinc-400">{{ t('settings.subtitle') }}</p>
    </div>

    <div class="card p-6">
      <h2 class="text-lg font-semibold text-zinc-900 dark:text-white mb-4">{{ t('settings.serverConfig') }}</h2>
      <div class="space-y-3 text-sm text-zinc-500 dark:text-zinc-400">
        <div
          class="flex items-center gap-3 p-3 rounded-lg bg-zinc-50 dark:bg-white/3 border border-zinc-100 dark:border-white/5"
        >
          <UIcon name="i-lucide-server" class="w-5 h-5 text-amber-600 dark:text-amber-400" />
          <span>{{ t('settings.qbDescription') }}</span>
        </div>
        <div
          class="flex items-center gap-3 p-3 rounded-lg bg-zinc-50 dark:bg-white/3 border border-zinc-100 dark:border-white/5"
        >
          <UIcon name="i-lucide-folder" class="w-5 h-5 text-cyan-600 dark:text-cyan-400" />
          <span>{{ t('settings.pathsDescription') }}</span>
        </div>
        <div
          class="flex items-center gap-3 p-3 rounded-lg bg-zinc-50 dark:bg-white/3 border border-zinc-100 dark:border-white/5"
        >
          <UIcon name="i-lucide-shield" class="w-5 h-5 text-green-600 dark:text-green-400" />
          <span
            >{{ t('settings.adminAccount') }}
            <code
              class="text-zinc-900 dark:text-white font-mono text-xs bg-zinc-100 dark:bg-white/5 px-1.5 py-0.5 rounded"
              >{{ user?.username }}</code
            ></span
          >
        </div>
      </div>
    </div>

    <div class="card p-6 mt-4">
      <h2 class="text-lg font-semibold text-zinc-900 dark:text-white mb-4">{{ t('settings.envVars') }}</h2>
      <div class="space-y-2 text-sm">
        <div
          class="flex items-center gap-2 p-2 rounded bg-zinc-50 dark:bg-white/3 border border-zinc-100 dark:border-white/5 font-mono text-xs overflow-x-auto"
        >
          <span class="text-zinc-400 dark:text-zinc-500 shrink-0">NUXT_QUI_PROXY_URL</span>
          <span class="text-zinc-300 dark:text-zinc-600">=</span>
          <span class="text-amber-600 dark:text-amber-400">http://localhost:7476/proxy/...</span>
        </div>
        <div
          class="flex items-center gap-2 p-2 rounded bg-zinc-50 dark:bg-white/3 border border-zinc-100 dark:border-white/5 font-mono text-xs overflow-x-auto"
        >
          <span class="text-zinc-400 dark:text-zinc-500 shrink-0">NUXT_SAVE_PATH_MOVIES</span>
          <span class="text-zinc-300 dark:text-zinc-600">=</span>
          <span class="text-amber-600 dark:text-amber-400">/mnt/storage/streaming/Movies</span>
        </div>
        <div
          class="flex items-center gap-2 p-2 rounded bg-zinc-50 dark:bg-white/3 border border-zinc-100 dark:border-white/5 font-mono text-xs overflow-x-auto"
        >
          <span class="text-zinc-400 dark:text-zinc-500 shrink-0">NUXT_SAVE_PATH_SERIES</span>
          <span class="text-zinc-300 dark:text-zinc-600">=</span>
          <span class="text-amber-600 dark:text-amber-400">/mnt/storage/streaming/Series</span>
        </div>
        <div
          class="flex items-center gap-2 p-2 rounded bg-zinc-50 dark:bg-white/3 border border-zinc-100 dark:border-white/5 font-mono text-xs overflow-x-auto"
        >
          <span class="text-zinc-400 dark:text-zinc-500 shrink-0">NUXT_SAVE_PATH_GAMES</span>
          <span class="text-zinc-300 dark:text-zinc-600">=</span>
          <span class="text-amber-600 dark:text-amber-400">/mnt/storage/streaming/Games</span>
        </div>
        <div
          class="flex items-center gap-2 p-2 rounded bg-zinc-50 dark:bg-white/3 border border-zinc-100 dark:border-white/5 font-mono text-xs overflow-x-auto"
        >
          <span class="text-zinc-400 dark:text-zinc-500 shrink-0">NUXT_SAVE_PATH_MUSIC</span>
          <span class="text-zinc-300 dark:text-zinc-600">=</span>
          <span class="text-amber-600 dark:text-amber-400">/mnt/storage/streaming/Music</span>
        </div>
        <div
          class="flex items-center gap-2 p-2 rounded bg-zinc-50 dark:bg-white/3 border border-zinc-100 dark:border-white/5 font-mono text-xs overflow-x-auto"
        >
          <span class="text-zinc-400 dark:text-zinc-500 shrink-0">NUXT_SAVE_PATH_BOOKS</span>
          <span class="text-zinc-300 dark:text-zinc-600">=</span>
          <span class="text-amber-600 dark:text-amber-400">/mnt/storage/streaming/Books</span>
        </div>
      </div>
    </div>

    <div class="card p-6 mt-4">
      <h2 class="text-lg font-semibold text-zinc-900 dark:text-white mb-4">{{ t('settings.howToChange') }}</h2>
      <p class="text-sm text-zinc-500 dark:text-zinc-400 mb-3">
        {{ t('settings.howToChangeDesc') }}
        <NuxtLink to="/admin/users" class="text-amber-600 dark:text-amber-400 hover:underline">{{
          t('nav.users')
        }}</NuxtLink>
        {{ t('settings.howToChangeDesc2') }}
      </p>
      <ul class="space-y-2 text-sm text-zinc-500 dark:text-zinc-400">
        <li class="flex items-center gap-2">
          <UIcon name="i-lucide-check" class="w-4 h-4 text-green-600 dark:text-green-400" />
          {{ t('settings.dailyDownloadLimit') }}
        </li>
        <li class="flex items-center gap-2">
          <UIcon name="i-lucide-check" class="w-4 h-4 text-green-600 dark:text-green-400" />
          {{ t('settings.activeTorrentLimit') }}
        </li>
        <li class="flex items-center gap-2">
          <UIcon name="i-lucide-check" class="w-4 h-4 text-green-600 dark:text-green-400" />
          {{ t('settings.maxTorrentSize') }}
        </li>
        <li class="flex items-center gap-2">
          <UIcon name="i-lucide-check" class="w-4 h-4 text-green-600 dark:text-green-400" />
          {{ t('settings.accountStatus') }}
        </li>
      </ul>
    </div>
  </div>
</template>
