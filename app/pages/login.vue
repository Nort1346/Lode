<script setup lang="ts">
import { mapApiError } from '~/types/api'

definePageMeta({
  layout: false
})

const { loggedIn, fetch: fetchSession } = useUserSession()
const colorMode = useColorMode()
const { t } = useI18n()

if (loggedIn.value) {
  navigateTo('/dashboard')
}

const form = reactive({
  username: '',
  password: ''
})
const loading = ref(false)
const error = ref('')

function toggleTheme() {
  colorMode.preference = colorMode.value === 'dark' ? 'light' : 'dark'
}

const isDark = computed(() => colorMode.value === 'dark')

async function handleLogin() {
  if (loading.value) return
  loading.value = true
  error.value = ''

  try {
    await $fetch('/api/auth/login', {
      method: 'POST',
      body: { username: form.username, password: form.password }
    })
    await fetchSession()
    window.location.href = '/dashboard'
  } catch (e: unknown) {
    const err = mapApiError(e)
    error.value = err.data?.statusMessage || t('login.failed')
    loading.value = false
  }
}
</script>

<template>
  <div class="bg-main min-h-dvh flex flex-col items-center justify-center p-4 pb-safe px-safe">
    <button
      class="flex items-center justify-center fixed top-4 right-4 p-2.5 rounded-xl bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-white/10 text-zinc-600 dark:text-zinc-400 hover:text-amber-600 dark:hover:text-amber-400 transition-colors shadow-sm"
      @click="toggleTheme"
    >
      <UIcon :name="isDark ? 'i-lucide-sun' : 'i-lucide-moon'" class="w-5 h-5" />
    </button>

    <div class="w-full max-w-md px-4">
      <div class="text-center mb-6 sm:mb-8 pt-safe">
        <h1 class="text-3xl sm:text-4xl font-bold text-gradient mb-2">StreamHub</h1>
        <p class="text-zinc-500 dark:text-zinc-400 text-sm sm:text-base">{{ t('login.subtitle') }}</p>
      </div>

      <div class="card p-5 sm:p-8">
        <form @submit.prevent="handleLogin">
          <div class="space-y-4 px-1 sm:px-0">
            <UFormField :label="t('login.usernameLabel')">
              <UInput
                v-model="form.username"
                :placeholder="t('login.usernamePlaceholder')"
                icon="i-lucide-user"
                class="w-full"
                size="lg"
                autocomplete="username"
              />
            </UFormField>

            <UFormField :label="t('login.passwordLabel')">
              <UInput
                v-model="form.password"
                type="password"
                :placeholder="t('login.passwordPlaceholder')"
                icon="i-lucide-lock"
                class="w-full"
                size="lg"
                autocomplete="current-password"
              />
            </UFormField>

            <UAlert v-if="error" :description="error" color="error" variant="subtle" class="mb-4" />

            <UButton
              type="submit"
              color="primary"
              variant="solid"
              size="lg"
              class="w-full justify-center"
              :loading="loading"
              :disabled="loading"
              :label="t('login.signIn')"
            />
          </div>
        </form>
      </div>
    </div>
  </div>
</template>
