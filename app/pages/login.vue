<script setup lang="ts">
definePageMeta({
  layout: false
})

const { loggedIn, fetch: fetchSession } = useUserSession()
const colorMode = useColorMode()

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
    const err = e as { data?: { statusMessage?: string } }
    error.value = err.data?.statusMessage || 'Login failed'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="bg-main min-h-screen flex flex-col items-center justify-center p-4">
    <button
      class="fixed top-4 right-4 p-2.5 rounded-xl bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-white/10 text-zinc-600 dark:text-zinc-400 hover:text-amber-600 dark:hover:text-amber-400 transition-colors shadow-sm"
      @click="toggleTheme"
    >
      <UIcon :name="isDark ? 'i-lucide-sun' : 'i-lucide-moon'" class="w-5 h-5" />
    </button>

    <div class="w-full max-w-md">
      <div class="text-center mb-8">
        <h1 class="text-4xl font-bold text-gradient mb-2">StreamHub</h1>
        <p class="text-zinc-500 dark:text-zinc-400">Access your downloading panel</p>
      </div>

      <div class="card p-8">
        <form @submit.prevent="handleLogin">
          <div class="space-y-4">
            <UFormField label="Username">
              <UInput
                v-model="form.username"
                placeholder="Enter your username"
                icon="i-lucide-user"
                class="w-full"
                size="lg"
              />
            </UFormField>

            <UFormField label="Password">
              <UInput
                v-model="form.password"
                type="password"
                placeholder="Enter your password"
                icon="i-lucide-lock"
                class="w-full"
                size="lg"
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
              label="Sign In"
            />
          </div>
        </form>
      </div>
    </div>
  </div>
</template>
