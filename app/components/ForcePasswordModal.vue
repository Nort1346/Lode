<script setup lang="ts">
import { mapApiError } from '~/composables/useApiError'

// Blocking modal: no close button, no backdrop/escape dismiss, no cancel action.
// It is only removed when the parent re-fetches /api/user/me after a successful change.
const emit = defineEmits<{
  changed: []
}>()

const { t } = useI18n()
const appConfig = useAppConfig()

const loading = ref(false)
const serverError = ref('')

const currentPassword = ref('')
const newPassword = ref('')
const confirmPassword = ref('')

const visible = reactive({ current: false, next: false, confirm: false })

const newPasswordError = computed(() => {
  if (newPassword.value && newPassword.value.length < 8) return t('profile.passwordTooShort')
  if (newPassword.value && newPassword.value === currentPassword.value) return t('profile.passwordSame')
  return ''
})

const confirmPasswordError = computed(() => {
  if (confirmPassword.value && newPassword.value !== confirmPassword.value) return t('profile.passwordMismatch')
  return ''
})

const canSubmit = computed(
  () =>
    !!currentPassword.value &&
    !!newPassword.value &&
    !!confirmPassword.value &&
    !newPasswordError.value &&
    !confirmPasswordError.value &&
    !loading.value
)

async function submit() {
  if (!canSubmit.value) return
  loading.value = true
  serverError.value = ''

  try {
    await $fetch('/api/user/password', {
      method: 'POST',
      body: { currentPassword: currentPassword.value, newPassword: newPassword.value }
    })
    emit('changed')
  } catch (e: unknown) {
    const data = mapApiError(e).data
    serverError.value = data?.statusMessage ?? t('profile.error')
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <UModal :open="true" :close="false" :dismissible="false">
    <template #header>
      <div class="flex flex-col items-center text-center">
        <div class="mb-4 flex size-12 items-center justify-center rounded-2xl bg-amber-500/10 ring-1 ring-amber-500/20">
          <UIcon name="i-lucide-shield-check" class="size-6 text-amber-600 dark:text-amber-400" />
        </div>
        <h3 class="font-semibold text-highlighted">{{ t('forcePassword.title') }}</h3>
        <p class="mt-1 text-sm text-muted">{{ t('forcePassword.description') }}</p>
      </div>
    </template>

    <template #body>
      <form class="space-y-4" @submit.prevent="submit">
        <UFormField :label="t('profile.currentPassword')">
          <UInput
            v-model="currentPassword"
            :type="visible.current ? 'text' : 'password'"
            class="w-full"
            autocomplete="current-password"
            :disabled="loading"
          >
            <template #trailing>
              <UButton
                type="button"
                color="neutral"
                variant="link"
                size="sm"
                :icon="visible.current ? appConfig.ui.icons.eyeOff : appConfig.ui.icons.eye"
                :aria-label="visible.current ? t('profile.hidePassword') : t('profile.showPassword')"
                :aria-pressed="visible.current"
                :disabled="loading"
                @click="visible.current = !visible.current"
              />
            </template>
          </UInput>
        </UFormField>

        <UFormField :label="t('profile.newPassword')" :error="newPasswordError || undefined">
          <UInput
            v-model="newPassword"
            :type="visible.next ? 'text' : 'password'"
            class="w-full"
            autocomplete="new-password"
            :disabled="loading"
          >
            <template #trailing>
              <UButton
                type="button"
                color="neutral"
                variant="link"
                size="sm"
                :icon="visible.next ? appConfig.ui.icons.eyeOff : appConfig.ui.icons.eye"
                :aria-label="visible.next ? t('profile.hidePassword') : t('profile.showPassword')"
                :aria-pressed="visible.next"
                :disabled="loading"
                @click="visible.next = !visible.next"
              />
            </template>
          </UInput>
        </UFormField>

        <UFormField :label="t('profile.confirmPassword')" :error="confirmPasswordError || undefined">
          <UInput
            v-model="confirmPassword"
            :type="visible.confirm ? 'text' : 'password'"
            class="w-full"
            autocomplete="new-password"
            :disabled="loading"
          >
            <template #trailing>
              <UButton
                type="button"
                color="neutral"
                variant="link"
                size="sm"
                :icon="visible.confirm ? appConfig.ui.icons.eyeOff : appConfig.ui.icons.eye"
                :aria-label="visible.confirm ? t('profile.hidePassword') : t('profile.showPassword')"
                :aria-pressed="visible.confirm"
                :disabled="loading"
                @click="visible.confirm = !visible.confirm"
              />
            </template>
          </UInput>
        </UFormField>

        <UAlert v-if="serverError" :description="serverError" color="error" variant="subtle" />

        <div class="pt-4 border-t border-default">
          <UButton
            type="submit"
            color="primary"
            variant="solid"
            size="lg"
            block
            :label="t('profile.savePassword')"
            :loading="loading"
            :disabled="!canSubmit"
          />
        </div>
      </form>
    </template>
  </UModal>
</template>
