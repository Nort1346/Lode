<script setup lang="ts">
import ConfirmDialog from '~/components/ConfirmDialog.vue'

interface CustomTracker {
  id: string
  indexerName: string
  trackerType: 'guid' | 'counting'
  cookie: string
  loginUrl: string | null
  loginUsername: string | null
  loginPassword: string | null
  enabled: boolean
  createdAt: string
}

definePageMeta({
  middleware: ['auth', 'admin'],
  layout: 'default'
})

const { t } = useI18n()
const overlay = useOverlay()

const trackers = ref<CustomTracker[]>([])
const loading = ref(true)
const showModal = ref(false)
const editTracker = ref<CustomTracker | null>(null)
const authMethod = ref<'cookie' | 'login'>('cookie')
const formTrackerType = ref<'guid' | 'counting'>('counting')
const formIndexerName = ref('')
const formCookie = ref('')
const formLoginUrl = ref('')
const formLoginUsername = ref('')
const formLoginPassword = ref('')
const saving = ref(false)
const error = ref('')
const testingLogin = ref(false)
const testResult = ref<{ success: boolean; message: string } | null>(null)

async function fetchTrackers() {
  loading.value = true
  try {
    const res = await $fetch<{ trackers: CustomTracker[] }>('/api/admin/trackers')
    trackers.value = res.trackers
  } catch {
    // silently fail
  } finally {
    loading.value = false
  }
}

onMounted(fetchTrackers)

function openCreate() {
  editTracker.value = null
  authMethod.value = 'cookie'
  formTrackerType.value = 'counting'
  formIndexerName.value = ''
  formCookie.value = ''
  formLoginUrl.value = ''
  formLoginUsername.value = ''
  formLoginPassword.value = ''
  error.value = ''
  testResult.value = null
  showModal.value = true
}

function openEdit(tracker: CustomTracker) {
  editTracker.value = tracker
  formIndexerName.value = tracker.indexerName
  formTrackerType.value = tracker.trackerType
  if (tracker.trackerType === 'guid' && tracker.loginUrl && tracker.loginUsername) {
    authMethod.value = 'login'
    formCookie.value = ''
    formLoginUrl.value = tracker.loginUrl
    formLoginUsername.value = tracker.loginUsername
    formLoginPassword.value = ''
  } else if (tracker.trackerType === 'guid') {
    authMethod.value = 'cookie'
    formCookie.value = tracker.cookie
    formLoginUrl.value = ''
    formLoginUsername.value = ''
    formLoginPassword.value = ''
  } else {
    authMethod.value = 'cookie'
    formCookie.value = ''
    formLoginUrl.value = ''
    formLoginUsername.value = ''
    formLoginPassword.value = ''
  }
  error.value = ''
  testResult.value = null
  showModal.value = true
}

async function testLogin() {
  testingLogin.value = true
  testResult.value = null
  try {
    const res = await $fetch<{ success: boolean; message: string; cookiePreview: string }>(
      '/api/admin/trackers/test-login',
      {
        method: 'POST',
        body: {
          loginUrl: formLoginUrl.value,
          loginUsername: formLoginUsername.value,
          loginPassword: formLoginPassword.value
        }
      }
    )
    testResult.value = { success: res.success, message: res.message }
  } catch (e: unknown) {
    const err = e as { data?: { statusMessage?: string }; statusMessage?: string }
    testResult.value = {
      success: false,
      message: err.data?.statusMessage ?? err.statusMessage ?? 'Unknown error'
    }
  } finally {
    testingLogin.value = false
  }
}

async function saveTracker() {
  saving.value = true
  error.value = ''
  testResult.value = null
  try {
    const body: Record<string, unknown> = {
      indexerName: formIndexerName.value,
      trackerType: formTrackerType.value
    }

    if (formTrackerType.value === 'guid') {
      if (authMethod.value === 'cookie') {
        body.cookie = formCookie.value
      } else {
        body.loginUrl = formLoginUrl.value
        body.loginUsername = formLoginUsername.value
        if (formLoginPassword.value) {
          body.loginPassword = formLoginPassword.value
        }
      }
    }

    if (editTracker.value) {
      await $fetch(`/api/admin/trackers/${editTracker.value.id}`, {
        method: 'PUT',
        body
      })
    } else {
      await $fetch('/api/admin/trackers', {
        method: 'POST',
        body
      })
    }
    showModal.value = false
    await fetchTrackers()
  } catch (e: unknown) {
    const err = e as { data?: { statusMessage?: string }; statusMessage?: string }
    error.value = err.data?.statusMessage ?? err.statusMessage ?? t('trackers.saveFailed')
  } finally {
    saving.value = false
  }
}

async function deleteTracker(tracker: CustomTracker) {
  const modal = overlay.create(ConfirmDialog, {
    props: {
      title: t('trackers.confirmDeleteTitle'),
      description: t('trackers.confirmDelete', { name: tracker.indexerName }),
      confirmLabel: t('common.delete'),
      cancelLabel: t('common.cancel')
    }
  })
  const confirmed = await modal.open()
  if (!confirmed) return

  try {
    await $fetch(`/api/admin/trackers/${tracker.id}`, { method: 'DELETE' })
    await fetchTrackers()
  } catch {
    // silently fail
  }
}

async function toggleEnabled(tracker: CustomTracker) {
  try {
    await $fetch(`/api/admin/trackers/${tracker.id}`, {
      method: 'PUT',
      body: { enabled: !tracker.enabled }
    })
    await fetchTrackers()
  } catch {
    // silently fail
  }
}

function maskCookie(cookie: string): string {
  if (cookie.length <= 16) return '••••••••'
  return cookie.substring(0, 8) + '••••' + cookie.substring(cookie.length - 8)
}

function formatDate(dateStr: string): string {
  if (!dateStr) return '-'
  return new Date(dateStr).toLocaleDateString()
}

function getMethodLabel(tracker: CustomTracker): string {
  if (tracker.trackerType === 'counting') return t('trackers.typeCounting')
  return tracker.loginUrl ? t('trackers.methodLogin') : t('trackers.methodCookie')
}
</script>

<template>
  <div>
    <div class="mb-8">
      <h1 class="text-3xl font-bold text-zinc-900 dark:text-white mb-2">{{ t('trackers.title') }}</h1>
      <p class="text-zinc-500 dark:text-zinc-400">{{ t('trackers.subtitle') }}</p>
    </div>

    <div class="card p-5 mb-6">
      <div class="flex items-start gap-3">
        <UIcon name="i-lucide-info" class="w-5 h-5 text-amber-500 mt-0.5 shrink-0" />
        <div class="text-sm text-zinc-600 dark:text-zinc-400">
          <p class="mb-1">{{ t('trackers.info1') }}</p>
          <p>{{ t('trackers.info2') }}</p>
        </div>
      </div>
    </div>

    <div class="card p-5 mb-6 flex items-center justify-between">
      <h2 class="text-lg font-semibold text-zinc-900 dark:text-white">{{ t('trackers.listTitle') }}</h2>
      <UButton icon="i-lucide-plus" :label="t('trackers.addTracker')" size="sm" @click="openCreate" />
    </div>

    <div v-if="loading" class="flex justify-center py-16">
      <UIcon name="i-lucide-loader-2" class="w-8 h-8 text-amber-500 dark:text-amber-400 animate-spin" />
    </div>

    <div v-else-if="trackers.length === 0" class="card p-12 text-center">
      <UIcon name="i-lucide-satellite-dish" class="w-12 h-12 text-zinc-300 dark:text-zinc-600 mx-auto mb-4" />
      <p class="text-zinc-500 dark:text-zinc-400">{{ t('trackers.noTrackers') }}</p>
    </div>

    <div v-else class="card overflow-hidden">
      <div class="overflow-x-auto">
        <table class="w-full">
          <thead>
            <tr class="table-header">
              <th class="px-4 py-3 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase">
                {{ t('trackers.tableIndexer') }}
              </th>
              <th
                class="px-4 py-3 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase hidden lg:table-cell"
              >
                {{ t('trackers.tableAuth') }}
              </th>
              <th
                class="px-4 py-3 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase hidden md:table-cell"
              >
                {{ t('trackers.tableCookie') }}
              </th>
              <th class="px-4 py-3 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase">
                {{ t('trackers.tableStatus') }}
              </th>
              <th
                class="px-4 py-3 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase hidden md:table-cell"
              >
                {{ t('trackers.tableCreated') }}
              </th>
              <th class="px-4 py-3 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase">
                {{ t('trackers.tableActions') }}
              </th>
            </tr>
          </thead>
          <tbody class="divide-y divide-zinc-200 dark:divide-white/5">
            <tr v-for="tracker in trackers" :key="tracker.id" class="table-row">
              <td class="px-4 py-3">
                <span class="text-sm font-medium text-zinc-900 dark:text-white font-mono">
                  {{ tracker.indexerName }}
                </span>
              </td>
              <td class="px-4 py-3 text-sm hidden lg:table-cell">
                <span
                  class="px-2 py-0.5 rounded-full text-xs font-medium"
                  :class="
                    tracker.trackerType === 'counting'
                      ? 'bg-zinc-500/15 text-zinc-700 dark:text-zinc-400'
                      : tracker.loginUrl
                        ? 'bg-cyan-500/15 text-cyan-700 dark:text-cyan-400'
                        : 'bg-amber-500/15 text-amber-700 dark:text-amber-400'
                  "
                >
                  {{ getMethodLabel(tracker) }}
                </span>
              </td>
              <td class="px-4 py-3 text-sm text-zinc-500 dark:text-zinc-400 hidden md:table-cell font-mono">
                {{
                  tracker.trackerType === 'counting'
                    ? '-'
                    : tracker.loginUrl
                      ? tracker.loginUsername
                      : maskCookie(tracker.cookie)
                }}
              </td>
              <td class="px-4 py-3">
                <button
                  class="relative inline-flex h-5 w-9 items-center rounded-full transition-colors"
                  :class="tracker.enabled ? 'bg-green-500' : 'bg-zinc-300 dark:bg-zinc-600'"
                  @click="toggleEnabled(tracker)"
                >
                  <span
                    class="inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform"
                    :class="tracker.enabled ? 'translate-x-4.5' : 'translate-x-0.5'"
                  />
                </button>
              </td>
              <td class="px-4 py-3 text-sm text-zinc-500 dark:text-zinc-400 hidden md:table-cell">
                {{ formatDate(tracker.createdAt) }}
              </td>
              <td class="px-4 py-3">
                <div class="flex items-center gap-2">
                  <UButton icon="i-lucide-pencil" variant="ghost" size="xs" @click="openEdit(tracker)" />
                  <UButton
                    icon="i-lucide-trash-2"
                    color="error"
                    variant="ghost"
                    size="xs"
                    @click="deleteTracker(tracker)"
                  />
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <UModal
      v-model:open="showModal"
      :title="editTracker ? t('trackers.editTracker') : t('trackers.addTracker')"
      class="max-w-lg"
    >
      <template #body>
        <div class="space-y-4">
          <UAlert v-if="error" color="error" :description="error" />

          <UFormField :label="t('trackers.indexerNameLabel')" :description="t('trackers.indexerNameDesc')">
            <UInput
              v-model="formIndexerName"
              :placeholder="t('trackers.indexerNamePlaceholder')"
              :disabled="editTracker !== null"
              class="w-full"
            />
          </UFormField>

          <div>
            <label class="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2 block">{{
              t('trackers.typeLabel')
            }}</label>
            <div class="flex gap-2">
              <UButton
                :label="t('trackers.typeCounting')"
                :variant="formTrackerType === 'counting' ? 'solid' : 'outline'"
                @click="formTrackerType = 'counting'"
              />
              <UButton
                :label="t('trackers.typeGuid')"
                :variant="formTrackerType === 'guid' ? 'solid' : 'outline'"
                @click="formTrackerType = 'guid'"
              />
            </div>
            <p class="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
              {{ formTrackerType === 'counting' ? t('trackers.typeCountingDesc') : t('trackers.typeGuidDesc') }}
            </p>
          </div>

          <div v-if="formTrackerType === 'guid'">
            <label class="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2 block">{{
              t('trackers.authMethod')
            }}</label>
            <div class="flex gap-2">
              <UButton
                :label="t('trackers.methodCookie')"
                :variant="authMethod === 'cookie' ? 'solid' : 'outline'"
                @click="authMethod = 'cookie'"
              />
              <UButton
                :label="t('trackers.methodLogin')"
                :variant="authMethod === 'login' ? 'solid' : 'outline'"
                @click="authMethod = 'login'"
              />
            </div>

            <div v-if="authMethod === 'cookie'" class="mt-3">
              <UFormField :label="t('trackers.cookieLabel')" :description="t('trackers.cookieDesc')">
                <UTextarea
                  v-model="formCookie"
                  :placeholder="t('trackers.cookiePlaceholder')"
                  :rows="4"
                  class="w-full"
                />
              </UFormField>
            </div>

            <div v-else class="space-y-3 mt-3">
              <UFormField :label="t('trackers.loginUrlLabel')" :description="t('trackers.loginUrlDesc')">
                <UInput v-model="formLoginUrl" :placeholder="t('trackers.loginUrlPlaceholder')" class="w-full" />
              </UFormField>
              <UFormField :label="t('trackers.loginUsernameLabel')">
                <UInput
                  v-model="formLoginUsername"
                  :placeholder="t('trackers.loginUsernamePlaceholder')"
                  class="w-full"
                />
              </UFormField>
              <UFormField
                :label="t('trackers.loginPasswordLabel')"
                :description="editTracker ? t('trackers.loginPasswordEdit') : ''"
              >
                <UInput
                  v-model="formLoginPassword"
                  type="password"
                  :placeholder="t('trackers.loginPasswordPlaceholder')"
                  class="w-full"
                />
              </UFormField>
              <div class="flex items-center gap-2">
                <UButton
                  :label="t('trackers.testLogin')"
                  icon="i-lucide-play"
                  variant="outline"
                  size="sm"
                  :loading="testingLogin"
                  :disabled="!formLoginUrl || !formLoginUsername || !formLoginPassword"
                  @click="testLogin"
                />
                <span
                  v-if="testResult"
                  class="text-sm"
                  :class="testResult.success ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'"
                >
                  {{ testResult.message }}
                </span>
              </div>
            </div>
          </div>

          <div v-if="editTracker" class="flex items-center gap-2">
            <label class="text-sm text-zinc-700 dark:text-zinc-300">{{ t('trackers.enabled') }}</label>
            <USwitch v-model="editTracker.enabled" />
          </div>
        </div>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton :label="t('common.cancel')" variant="ghost" @click="showModal = false" />
          <UButton
            :label="editTracker ? t('common.saveChanges') : t('common.create')"
            :loading="saving"
            @click="saveTracker"
          />
        </div>
      </template>
    </UModal>
  </div>
</template>
