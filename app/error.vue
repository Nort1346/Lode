<script setup lang="ts">
import type { NuxtError } from '#app'

const props = defineProps<{
  error: NuxtError
}>()

const { t } = useI18n()
const colorMode = useColorMode()
const { loggedIn } = useUserSession()

// eslint-disable-next-line @typescript-eslint/no-deprecated -- h3 error objects carry `statusCode` at runtime in Nuxt 4.5; `status` is typing-only
const is404 = computed(() => props.error?.statusCode === 404)

useSeoMeta({
  title: () => (is404.value ? t('notFound.metaTitle') : t('error.metaTitle'))
})

function toggleTheme() {
  colorMode.preference = colorMode.value === 'dark' ? 'light' : 'dark'
}

const isDark = computed(() => colorMode.value === 'dark')

function goPrimary() {
  void navigateTo(loggedIn.value ? '/dashboard' : '/login')
}

function goBrowse() {
  void navigateTo('/browse')
}
</script>

<template>
  <UApp>
    <div class="bg-main min-h-dvh flex flex-col items-center justify-center p-4 pb-safe px-safe">
      <button
        class="flex items-center justify-center fixed top-4 right-4 p-2.5 rounded-xl bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-white/10 text-zinc-600 dark:text-zinc-400 hover:text-amber-600 dark:hover:text-amber-400 transition-colors shadow-sm"
        :aria-label="isDark ? t('theme.light') : t('theme.dark')"
        @click="toggleTheme"
      >
        <UIcon :name="isDark ? 'i-lucide-sun' : 'i-lucide-moon'" class="w-5 h-5" />
      </button>

      <div class="w-full max-w-md px-4 text-center pt-safe">
        <!-- 404: page not in the library -->
        <template v-if="is404">
          <h1 v-reveal="1" class="text-7xl sm:text-9xl font-black leading-none tracking-tight text-gradient" aria-hidden="true">
            404
          </h1>
          <h2 v-reveal="2" class="mt-6 text-xl sm:text-2xl font-semibold text-highlighted" role="alert">
            {{ t('notFound.title') }}
          </h2>
          <p v-reveal="3" class="mt-2 text-sm sm:text-base text-muted">
            {{ t('notFound.description') }}
          </p>
        </template>

        <!-- Any other error (500, etc.) -->
        <template v-else>
          <div v-reveal="1" class="mb-4 mt-4 flex size-12 items-center justify-center rounded-2xl bg-red-500/10 ring-1 ring-red-500/20">
            <UIcon name="i-lucide-triangle-alert" class="size-6 text-red-600 dark:text-red-400" />
          </div>
          <h1 v-reveal="2" class="text-xl sm:text-2xl font-semibold text-highlighted" role="alert">
            {{ t('common.error') }}
          </h1>
          <p v-reveal="3" class="mt-2 text-sm sm:text-base text-muted">
            {{ t('error.description') }}
          </p>
        </template>

        <div v-reveal="3" class="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
          <UButton
            color="primary"
            variant="solid"
            size="lg"
            class="w-full sm:w-auto"
            :icon="loggedIn ? 'i-lucide-layout-dashboard' : 'i-lucide-log-in'"
            :label="loggedIn ? t('notFound.backToDashboard') : t('login.signIn')"
            @click="goPrimary"
          />
          <UButton
            v-if="loggedIn"
            color="neutral"
            variant="ghost"
            size="lg"
            class="w-full sm:w-auto"
            icon="i-lucide-film"
            :label="t('nav.browse')"
            @click="goBrowse"
          />
        </div>
      </div>
    </div>
  </UApp>
</template>

<style scoped>
/* Respect prefers-reduced-motion: show content immediately, no entrance animation */
@media (prefers-reduced-motion: reduce) {
  .reveal,
  .reveal.revealed,
  .fade-in,
  .fade-in.revealed {
    animation: none !important;
    opacity: 1 !important;
    transform: none !important;
  }
}
</style>
