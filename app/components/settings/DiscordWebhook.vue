<script setup lang="ts">
const { t } = useI18n()
const toast = useToast()

const discordLocale = ref('en')
const discordMentionsEnabled = ref(false)
const loading = ref(true)

const LOCALE_NAMES: Record<string, string> = {
  pl: 'Polski',
  en: 'English',
  de: 'Deutsch',
  fr: 'Français',
  es: 'Español'
}

const localeOptions = computed(() => Object.entries(LOCALE_NAMES).map(([value, label]) => ({ label, value })))

async function fetchData() {
  loading.value = true
  try {
    const [localeData, mentionsData] = await Promise.all([
      $fetch<{ locale: string }>('/api/admin/discord-locale'),
      $fetch<{ enabled: boolean }>('/api/admin/discord-mentions')
    ])
    discordLocale.value = localeData.locale
    discordMentionsEnabled.value = mentionsData.enabled
  } catch {
    // ignore
  } finally {
    loading.value = false
  }
}

async function changeDiscordLocale(newLocale: string) {
  const validLocales = ['pl', 'en', 'de', 'fr', 'es']
  const valid = validLocales.includes(newLocale) ? newLocale : 'en'
  discordLocale.value = valid
  await $fetch('/api/admin/discord-locale', { method: 'PUT', body: { locale: valid } })
  toast.add({ title: t('settings.discordLocaleSaved'), color: 'success' })
}

async function toggleDiscordMentions() {
  const newValue = !discordMentionsEnabled.value
  await $fetch('/api/admin/discord-mentions', { method: 'PUT', body: { enabled: newValue } })
  discordMentionsEnabled.value = newValue
  toast.add({ title: t('settings.discordMentionsSaved'), color: 'success' })
}

onMounted(fetchData)
</script>

<template>
  <div class="card p-6 mb-4">
    <h2 class="text-lg font-semibold text-zinc-900 dark:text-white mb-4">{{ t('settings.discordTitle') }}</h2>
    <p class="text-sm text-zinc-500 dark:text-zinc-400 mb-4">{{ t('settings.discordDesc') }}</p>
    <div v-if="loading" class="space-y-3">
      <USkeleton class="h-10 w-full rounded-xl" />
      <USkeleton class="h-10 w-full rounded-xl" />
    </div>
    <div v-else class="space-y-4">
      <div>
        <label class="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">{{
          t('settings.discordLocale')
        }}</label>
        <USelect :model-value="discordLocale" :items="localeOptions" @update:model-value="changeDiscordLocale" />
        <p class="text-xs text-zinc-400 dark:text-zinc-500 mt-4">{{ t('settings.discordLocaleDesc') }}</p>
      </div>
      <div>
        <div class="flex items-center justify-between">
          <label class="block text-sm font-medium text-zinc-700 dark:text-zinc-300">{{
            t('admin.discordMentions')
          }}</label>
          <USwitch :model-value="discordMentionsEnabled" @update:model-value="toggleDiscordMentions" />
        </div>
        <p class="text-xs text-zinc-400 dark:text-zinc-500 mt-1">{{ t('admin.discordMentionsDesc') }}</p>
      </div>
    </div>
  </div>
</template>
