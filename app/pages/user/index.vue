<script setup lang="ts">
import type { UserProfile } from '~/types/user'

definePageMeta({
  middleware: 'auth'
})

const { user } = useUserSession()
const { t } = useI18n()
const toast = useToast()
const { generatePreviews, getAvailableStyles } = useDicebear()

const { data: profile } = useFetch<UserProfile>('/api/user/me')
const saving = ref(false)
const uploading = ref(false)
const fileInputRef = ref<HTMLInputElement | null>(null)
const avatarVersion = useState('avatarVersion', () => 0)

const availableStyles = getAvailableStyles()

const styleLabels: Record<string, string> = {
  adventurer: 'Adventurer',
  avataaars: 'Avataaars',
  'big-ears': 'Big Ears',
  bottts: 'Bottts',
  'fun-emoji': 'Fun Emoji',
  lorelei: 'Lorelei',
  micah: 'Micah',
  notionists: 'Notionists',
  'open-peeps': 'Open Peeps',
  personas: 'Personas',
  'pixel-art': 'Pixel Art',
  'toon-head': 'Toon Head'
}

const styleSections = computed(() =>
  availableStyles.map((name) => ({
    name,
    label: styleLabels[name] ?? name,
    previews: generatePreviews(name)
  }))
)

const currentAvatarSrc = computed(() => {
  const url = profile.value?.avatarUrl
  if (!url) return undefined
  return `${url}?v=${avatarVersion.value}`
})

async function selectAvatar(styleName: string, seed: string, bgColor: string) {
  if (saving.value) return
  saving.value = true
  try {
    const res = await $fetch<{ avatarUrl: string }>('/api/user/avatar', {
      method: 'PUT',
      body: { style: styleName, seed, bgColor }
    })
    profile.value = { ...profile.value!, avatarUrl: res.avatarUrl }
    avatarVersion.value++
    refreshNuxtData()
    toast.add({ title: t('profile.saved'), color: 'success' })
  } catch (err) {
    const msg = err instanceof Error ? err.message : t('profile.error')
    toast.add({ title: t('profile.error'), description: msg, color: 'error' })
  } finally {
    saving.value = false
  }
}

function triggerFileInput() {
  fileInputRef.value?.click()
}

async function onFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return

  uploading.value = true
  try {
    const formData = new FormData()
    formData.append('avatar', file)
    const res = await $fetch<{ avatarUrl: string }>('/api/user/avatar/upload', {
      method: 'POST',
      body: formData
    })
    profile.value = { ...profile.value!, avatarUrl: res.avatarUrl }
    avatarVersion.value++
    refreshNuxtData()
    toast.add({ title: t('profile.uploaded'), color: 'success' })
  } catch (err) {
    const msg = err instanceof Error ? err.message : t('profile.error')
    toast.add({ title: t('profile.error'), description: msg, color: 'error' })
  } finally {
    uploading.value = false
    if (fileInputRef.value) fileInputRef.value.value = ''
  }
}

async function removeAvatar() {
  saving.value = true
  try {
    await $fetch('/api/user/avatar', { method: 'DELETE' })
    profile.value = { ...profile.value!, avatarUrl: null }
    avatarVersion.value++
    refreshNuxtData()
    toast.add({ title: t('profile.removed'), color: 'success' })
  } catch (err) {
    const msg = err instanceof Error ? err.message : t('profile.error')
    toast.add({ title: t('profile.error'), description: msg, color: 'error' })
  } finally {
    saving.value = false
  }
}

const currentPassword = ref('')
const newPassword = ref('')
const confirmPassword = ref('')
const changingPassword = ref(false)

const passwordError = computed(() => {
  if (newPassword.value && newPassword.value.length < 8) return t('profile.passwordTooShort')
  if (confirmPassword.value && newPassword.value !== confirmPassword.value) return t('profile.passwordMismatch')
  if (newPassword.value && newPassword.value === currentPassword.value) return t('profile.passwordSame')
  return ''
})

async function changePassword() {
  if (passwordError.value || !currentPassword.value || !newPassword.value) return
  changingPassword.value = true
  try {
    await $fetch('/api/user/password', {
      method: 'POST',
      body: { currentPassword: currentPassword.value, newPassword: newPassword.value }
    })
    currentPassword.value = ''
    newPassword.value = ''
    confirmPassword.value = ''
    toast.add({ title: t('profile.passwordChanged'), color: 'success' })
  } catch (err) {
    const msg = err instanceof Error ? err.message : t('profile.error')
    const data = (err as { data?: { statusMessage?: string } }).data
    toast.add({ title: t('profile.error'), description: data?.statusMessage || msg, color: 'error' })
  } finally {
    changingPassword.value = false
  }
}
</script>

<template>
  <div class="max-w-3xl mx-auto space-y-8">
    <h1 v-reveal class="text-3xl font-bold text-zinc-900 dark:text-white">{{ t('profile.title') }}</h1>

    <div v-if="profile" class="space-y-8">
      <div v-reveal="1" class="flex items-center gap-5 py-4">
        <div class="rounded-full ring-4 ring-amber-400/30 dark:ring-amber-500/20 p-1.5">
          <img
            v-if="currentAvatarSrc"
            :src="currentAvatarSrc"
            :alt="user?.username"
            class="w-28 h-28 rounded-full object-cover"
          />
          <div v-else class="w-28 h-28 rounded-full bg-zinc-200 dark:bg-zinc-700 flex items-center justify-center">
            <UIcon name="i-lucide-user" class="w-12 h-12 text-zinc-400" />
          </div>
        </div>
        <div v-reveal="3">
          <p class="text-2xl font-bold text-zinc-900 dark:text-white">{{ user?.username }}</p>
          <p class="text-sm text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">{{ user?.role }}</p>
        </div>
      </div>

      <div v-reveal="2" class="border-y border-zinc-200 dark:border-white/10 py-6">
        <h2 class="text-lg font-semibold text-zinc-900 dark:text-white mb-1">{{ t('profile.passwordTitle') }}</h2>
        <p class="text-sm text-zinc-500 dark:text-zinc-400 mb-4">{{ t('profile.passwordDesc') }}</p>
        <form class="space-y-4 max-w-sm" @submit.prevent="changePassword">
          <UFormField :label="t('profile.currentPassword')">
            <UInput v-model="currentPassword" type="password" class="w-full" autocomplete="current-password" />
          </UFormField>
          <UFormField :label="t('profile.newPassword')">
            <UInput v-model="newPassword" type="password" class="w-full" autocomplete="new-password" />
          </UFormField>
          <UFormField :label="t('profile.confirmPassword')">
            <UInput v-model="confirmPassword" type="password" class="w-full" autocomplete="new-password" />
          </UFormField>
          <p v-if="passwordError" class="text-sm text-red-500">{{ passwordError }}</p>
          <UButton
            type="submit"
            variant="outline"
            :label="t('profile.savePassword')"
            :loading="changingPassword"
            :disabled="!!passwordError || !currentPassword || !newPassword || !confirmPassword"
          />
        </form>
      </div>

      <div v-reveal>
        <h2 class="text-lg font-semibold text-zinc-900 dark:text-white mb-1">
          {{ t('profile.dicebearTitle') }}
        </h2>
        <p class="text-sm text-zinc-500 dark:text-zinc-400 mb-6">{{ t('profile.dicebearDesc') }}</p>

        <div class="space-y-8">
          <div v-for="section in styleSections" :key="section.name" v-reveal>
            <h3 class="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-3">
              {{ section.label }}
            </h3>
            <div class="flex flex-wrap gap-3">
              <button
                v-for="item in section.previews"
                :key="item.seed"
                :disabled="saving"
                class="shrink-0 rounded-full ring-2 ring-transparent hover:ring-amber-400 dark:hover:ring-amber-500 transition-all cursor-pointer disabled:opacity-50 focus:outline-none focus:ring-amber-400"
                @click="selectAvatar(section.name, item.seed, item.bgColor)"
              >
                <img :src="item.dataUri" :alt="item.seed" class="size-20 rounded-full" loading="lazy" />
              </button>
            </div>
          </div>
        </div>
      </div>

      <div class="border-t border-zinc-200 dark:border-white/10 pt-6">
        <h2 class="text-lg font-semibold text-zinc-900 dark:text-white mb-1">{{ t('profile.uploadTitle') }}</h2>
        <p class="text-sm text-zinc-500 dark:text-zinc-400 mb-4">{{ t('profile.uploadDesc') }}</p>
        <input
          ref="fileInputRef"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          class="hidden"
          @change="onFileChange"
        />
        <div class="flex items-center gap-3">
          <UButton
            variant="outline"
            icon="i-lucide-upload"
            :label="t('profile.uploadButton')"
            :loading="uploading"
            :disabled="saving"
            @click="triggerFileInput"
          />
          <UButton
            v-if="currentAvatarSrc"
            variant="ghost"
            icon="i-lucide-trash-2"
            color="error"
            :label="t('profile.removeButton')"
            :loading="saving"
            :disabled="uploading"
            @click="removeAvatar"
          />
        </div>
      </div>
    </div>

    <div v-else class="max-w-3xl mx-auto space-y-8">
      <div class="h-8 w-32 rounded bg-zinc-200 dark:bg-zinc-700 animate-pulse" />
      <div class="space-y-8">
        <div class="flex items-center gap-5 py-4">
          <div class="rounded-full ring-4 ring-zinc-200 dark:ring-zinc-700 p-1.5">
            <div class="w-28 h-28 rounded-full bg-zinc-200 dark:bg-zinc-700 animate-pulse" />
          </div>
          <div class="space-y-2">
            <div class="h-7 w-40 rounded bg-zinc-200 dark:bg-zinc-700 animate-pulse" />
            <div class="h-4 w-16 rounded bg-zinc-200 dark:bg-zinc-700 animate-pulse" />
          </div>
        </div>
        <div class="border-y border-zinc-200 dark:border-white/10 py-6 space-y-4">
          <div class="h-5 w-48 rounded bg-zinc-200 dark:bg-zinc-700 animate-pulse" />
          <div class="h-4 w-64 rounded bg-zinc-200 dark:bg-zinc-700 animate-pulse" />
          <div class="space-y-3 max-w-sm">
            <div class="h-4 w-32 rounded bg-zinc-200 dark:bg-zinc-700 animate-pulse" />
            <div class="h-10 w-full rounded bg-zinc-200 dark:bg-zinc-700 animate-pulse" />
            <div class="h-4 w-32 rounded bg-zinc-200 dark:bg-zinc-700 animate-pulse" />
            <div class="h-10 w-full rounded bg-zinc-200 dark:bg-zinc-700 animate-pulse" />
            <div class="h-4 w-36 rounded bg-zinc-200 dark:bg-zinc-700 animate-pulse" />
            <div class="h-10 w-full rounded bg-zinc-200 dark:bg-zinc-700 animate-pulse" />
            <div class="h-9 w-36 rounded bg-zinc-200 dark:bg-zinc-700 animate-pulse" />
          </div>
        </div>
        <div class="space-y-4">
          <div class="h-5 w-48 rounded bg-zinc-200 dark:bg-zinc-700 animate-pulse" />
          <div class="h-4 w-64 rounded bg-zinc-200 dark:bg-zinc-700 animate-pulse" />
          <div class="space-y-4">
            <div v-for="r in 3" :key="r" class="space-y-2">
              <div class="h-4 w-24 rounded bg-zinc-200 dark:bg-zinc-700 animate-pulse" />
              <div class="flex gap-3">
                <div v-for="i in 8" :key="i" class="size-20 rounded-full bg-zinc-200 dark:bg-zinc-700 animate-pulse" />
              </div>
            </div>
          </div>
        </div>
        <div class="border-t border-zinc-200 dark:border-white/10 pt-6 space-y-3">
          <div class="h-5 w-40 rounded bg-zinc-200 dark:bg-zinc-700 animate-pulse" />
          <div class="h-4 w-56 rounded bg-zinc-200 dark:bg-zinc-700 animate-pulse" />
          <div class="flex gap-3">
            <div class="h-10 w-36 rounded bg-zinc-200 dark:bg-zinc-700 animate-pulse" />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
