<script setup lang="ts">
import type { AdminUser } from '~/types/admin'
import { formatDate } from '~/composables/useTorrentUtils'

definePageMeta({
  middleware: ['auth', 'admin'],
  layout: 'default'
})

const { t } = useI18n()
const users = ref<AdminUser[]>([])
const loading = ref(true)
const showModal = ref(false)
const editingUser = ref<AdminUser | null>(null)
const form = reactive({
  username: '',
  password: '',
  role: 'user',
  dailyDownloadLimit: 5,
  activeTorrentLimit: 3,
  maxTorrentSizeGb: 20,
  privateTrackerLimit: 5,
  discordId: '',
  canSubmit: false,
  maxSessions: 0,
  jellyfinLibraryAccess: 'all' as string[] | 'all',
  jellyfinEnableVideoTranscoding: true,
  jellyfinEnableAudioTranscoding: true,
  jellyfinEnableRemuxing: true,
  jellyfinEnableLiveTvAccess: true,
  jellyfinEnableLiveTvManagement: false,
  jellyfinMaxActiveSessions: 0,
  expiresAt: null as string | null
})

const pendingAvatarFile = ref<File | null>(null)
const pendingAvatarRemoved = ref(false)

const saving = ref(false)
const error = ref('')

const syncStatusColor = (status: string) => {
  if (status === 'synced') return 'bg-green-500/10 text-green-700 dark:text-green-400'
  if (status === 'failed') return 'bg-red-500/10 text-red-700 dark:text-red-400'
  return 'bg-yellow-500/10 text-yellow-700 dark:text-yellow-400'
}

async function fetchUsers() {
  loading.value = true
  try {
    const res = await $fetch('/api/admin/users')
    users.value = res as AdminUser[]
  } catch {
    // silently fail
  } finally {
    loading.value = false
  }
}

onMounted(fetchUsers)

function resetForm() {
  form.username = ''
  form.password = ''
  form.role = 'user'
  form.dailyDownloadLimit = 5
  form.activeTorrentLimit = 3
  form.maxTorrentSizeGb = 20
  form.privateTrackerLimit = 5
  form.discordId = ''
  form.canSubmit = false
  form.maxSessions = 0
  form.expiresAt = null
}

async function fetchPresets() {
  try {
    const res = await $fetch('/api/admin/jellyfin/presets')
    const data = res as {
      libraryAccess: string[] | 'all'
      videoTranscoding: boolean
      audioTranscoding: boolean
      remuxing: boolean
      liveTvAccess: boolean
      liveTvManagement: boolean
      maxActiveSessions: number
    }
    form.jellyfinLibraryAccess = data.libraryAccess
    form.jellyfinEnableVideoTranscoding = data.videoTranscoding
    form.jellyfinEnableAudioTranscoding = data.audioTranscoding
    form.jellyfinEnableRemuxing = data.remuxing
    form.jellyfinEnableLiveTvAccess = data.liveTvAccess
    form.jellyfinEnableLiveTvManagement = data.liveTvManagement
    form.jellyfinMaxActiveSessions = data.maxActiveSessions
  } catch {
    form.jellyfinLibraryAccess = 'all'
    form.jellyfinEnableVideoTranscoding = true
    form.jellyfinEnableAudioTranscoding = true
    form.jellyfinEnableRemuxing = true
    form.jellyfinEnableLiveTvAccess = true
    form.jellyfinEnableLiveTvManagement = false
    form.jellyfinMaxActiveSessions = 0
  }
}

function openCreate() {
  editingUser.value = null
  resetForm()
  pendingAvatarFile.value = null
  pendingAvatarRemoved.value = false
  error.value = ''
  showModal.value = true
  fetchPresets()
}

function openEdit(user: AdminUser) {
  editingUser.value = user
  form.username = user.username
  form.password = ''
  form.role = user.role
  form.dailyDownloadLimit = user.dailyDownloadLimit
  form.activeTorrentLimit = user.activeTorrentLimit
  form.maxTorrentSizeGb = user.maxTorrentSizeGb
  form.privateTrackerLimit = user.privateTrackerLimit
  form.discordId = user.discordId ?? ''
  form.canSubmit = user.canSubmit
  form.maxSessions = user.maxSessions ?? 0
  form.jellyfinLibraryAccess = user.jellyfinLibraryAccess ?? 'all'
  form.jellyfinEnableVideoTranscoding = user.jellyfinEnableVideoTranscoding ?? true
  form.jellyfinEnableAudioTranscoding = user.jellyfinEnableAudioTranscoding ?? true
  form.jellyfinEnableRemuxing = user.jellyfinEnableRemuxing ?? true
  form.jellyfinEnableLiveTvAccess = user.jellyfinEnableLiveTvAccess ?? true
  form.jellyfinEnableLiveTvManagement = user.jellyfinEnableLiveTvManagement ?? false
  form.jellyfinMaxActiveSessions = user.jellyfinMaxActiveSessions ?? 0
  form.expiresAt = user.expiresAt ?? null
  pendingAvatarFile.value = null
  pendingAvatarRemoved.value = false
  error.value = ''
  showModal.value = true
}

async function saveUser() {
  saving.value = true
  error.value = ''

  try {
    if (editingUser.value) {
      const body: Record<string, unknown> = {
        role: form.role,
        dailyDownloadLimit: form.dailyDownloadLimit,
        activeTorrentLimit: form.activeTorrentLimit,
        maxTorrentSizeGb: form.maxTorrentSizeGb,
        privateTrackerLimit: form.privateTrackerLimit,
        discordId: form.discordId || null,
        canSubmit: form.canSubmit,
        maxSessions: form.maxSessions,
        jellyfinLibraryAccess: form.jellyfinLibraryAccess,
        jellyfinEnableVideoTranscoding: form.jellyfinEnableVideoTranscoding,
        jellyfinEnableAudioTranscoding: form.jellyfinEnableAudioTranscoding,
        jellyfinEnableRemuxing: form.jellyfinEnableRemuxing,
        jellyfinEnableLiveTvAccess: form.jellyfinEnableLiveTvAccess,
        jellyfinEnableLiveTvManagement: form.jellyfinEnableLiveTvManagement,
        jellyfinMaxActiveSessions: form.jellyfinMaxActiveSessions,
        expiresAt: form.expiresAt
      }
      if (form.password) body.password = form.password
      if (form.username !== editingUser.value.username) body.username = form.username

      await $fetch(`/api/admin/users/${editingUser.value.id}`, {
        method: 'PUT',
        body
      })

      if (pendingAvatarRemoved.value) {
        await $fetch('/api/admin/jellyfin/avatar', {
          method: 'DELETE',
          body: { userId: editingUser.value.id }
        })
      } else if (pendingAvatarFile.value) {
        const formData = new FormData()
        formData.append('userId', editingUser.value.id)
        formData.append('avatar', pendingAvatarFile.value)
        await $fetch('/api/admin/jellyfin/avatar', { method: 'POST', body: formData })
      }
    } else {
      const res = await $fetch<{ success: boolean; id: string }>('/api/admin/users', {
        method: 'POST',
        body: { ...form }
      })
      if (pendingAvatarFile.value) {
        const formData = new FormData()
        formData.append('userId', res.id)
        formData.append('avatar', pendingAvatarFile.value)
        await $fetch('/api/admin/jellyfin/avatar', { method: 'POST', body: formData })
      }
    }

    showModal.value = false
    await fetchUsers()
  } catch (e: unknown) {
    const err = e as { data?: { statusMessage?: string } }
    error.value = err.data?.statusMessage || t('admin.saveFailed')
  } finally {
    saving.value = false
  }
}

async function deleteUser(id: string) {
  if (!confirm(t('admin.confirmDelete'))) return

  try {
    await $fetch(`/api/admin/users/${id}`, { method: 'DELETE' })
    await fetchUsers()
  } catch {
    // silently fail
  }
}

async function toggleActive(user: { id: string; isActive: boolean }) {
  if (user.isActive) {
    if (!confirm(t('admin.jellyfinDisableWarning'))) return
  }

  try {
    await $fetch(`/api/admin/users/${user.id}`, {
      method: 'PUT',
      body: { isActive: !user.isActive }
    })
    await fetchUsers()
  } catch {
    // silently fail
  }
}

const roleOptions = computed(() => [
  { label: t('admin.roleUser'), value: 'user' },
  { label: t('admin.roleAdmin'), value: 'admin' }
])

function toLocalDateString(iso: string | null): string {
  if (!iso) return ''
  return iso.slice(0, 10)
}

function onExpiresAtInput(event: Event) {
  const value = (event.target as HTMLInputElement).value
  form.expiresAt = value ? `${value}T00:00:00.000Z` : null
}
</script>

<template>
  <div>
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
      <div>
        <h1 class="text-3xl font-bold text-zinc-900 dark:text-white mb-2">{{ t('admin.userTitle') }}</h1>
        <p class="text-zinc-500 dark:text-zinc-400">{{ t('admin.userSubtitle') }}</p>
      </div>
      <UButton icon="i-lucide-plus" :label="t('admin.addUser')" @click="openCreate" />
    </div>

    <div v-if="loading" class="flex justify-center py-16">
      <UIcon name="i-lucide-loader-2" class="w-8 h-8 text-amber-500 dark:text-amber-400 animate-spin" />
    </div>

    <div v-else class="card overflow-hidden">
      <div class="overflow-x-auto">
        <table class="w-full">
          <thead>
            <tr class="table-header">
              <th class="px-4 py-3 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase">
                {{ t('admin.tableUser') }}
              </th>
              <th
                class="px-4 py-3 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase hidden sm:table-cell"
              >
                {{ t('admin.tableRole') }}
              </th>
              <th
                class="px-4 py-3 text-center text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase hidden md:table-cell"
              >
                {{ t('admin.tableDaily') }}
              </th>
              <th
                class="px-4 py-3 text-center text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase hidden md:table-cell"
              >
                {{ t('admin.tableActive') }}
              </th>
              <th
                class="px-4 py-3 text-center text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase hidden lg:table-cell"
              >
                {{ t('admin.tableMaxSize') }}
              </th>
              <th
                class="px-4 py-3 text-center text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase hidden lg:table-cell"
              >
                {{ t('admin.privateTrackerLimit') }}
              </th>
              <th
                class="px-4 py-3 text-center text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase hidden xl:table-cell"
              >
                {{ t('admin.canSubmit') }}
              </th>
              <th
                class="px-4 py-3 text-center text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase hidden xl:table-cell"
              >
                {{ t('admin.syncStatus') }}
              </th>
              <th class="px-4 py-3 text-center text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase">
                {{ t('admin.tableStatus') }}
              </th>
              <th
                class="px-4 py-3 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase hidden xl:table-cell"
              >
                {{ t('admin.tableCreated') }}
              </th>
              <th class="px-4 py-3 text-right text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase">
                {{ t('admin.tableActions') }}
              </th>
            </tr>
          </thead>
          <tbody class="divide-y divide-zinc-200 dark:divide-white/5">
            <tr v-for="u in users" :key="u.id" class="table-row">
              <td class="px-4 py-3">
                <div class="flex items-center gap-3">
                  <UAvatar :src="u.avatarUrl ?? undefined" :alt="u.username" size="sm" />
                  <div>
                    <span class="text-sm font-medium text-zinc-900 dark:text-white">{{ u.username }}</span>
                    <span
                      class="sm:hidden ml-2 text-xs px-1.5 py-0.5 rounded-full"
                      :class="
                        u.role === 'admin'
                          ? 'bg-amber-500/10 text-amber-700 dark:text-amber-400'
                          : 'bg-zinc-100 dark:bg-white/10 text-zinc-500 dark:text-zinc-400'
                      "
                      >{{ u.role }}</span
                    >
                  </div>
                </div>
              </td>
              <td class="px-4 py-3 hidden sm:table-cell">
                <span
                  class="text-xs px-2 py-1 rounded-full"
                  :class="
                    u.role === 'admin'
                      ? 'bg-amber-500/10 text-amber-700 dark:text-amber-400'
                      : 'bg-zinc-100 dark:bg-white/10 text-zinc-500 dark:text-zinc-400'
                  "
                >
                  {{ u.role }}
                </span>
              </td>
              <td class="px-4 py-3 text-center text-sm text-zinc-600 dark:text-zinc-300 hidden md:table-cell">
                {{ u.dailyDownloadLimit }}
              </td>
              <td class="px-4 py-3 text-center text-sm text-zinc-600 dark:text-zinc-300 hidden md:table-cell">
                {{ u.activeTorrentLimit }}
              </td>
              <td class="px-4 py-3 text-center text-sm text-zinc-600 dark:text-zinc-300 hidden lg:table-cell">
                {{ u.maxTorrentSizeGb }}GB
              </td>
              <td class="px-4 py-3 text-center text-sm text-zinc-600 dark:text-zinc-300 hidden lg:table-cell">
                {{ u.privateTrackerLimit }}
              </td>
              <td class="px-4 py-3 text-center hidden xl:table-cell">
                <span
                  class="text-xs px-2 py-1 rounded-full"
                  :class="
                    u.canSubmit
                      ? 'bg-green-500/10 text-green-700 dark:text-green-400'
                      : 'bg-zinc-100 dark:bg-white/10 text-zinc-500 dark:text-zinc-400'
                  "
                >
                  {{ u.canSubmit ? t('admin.canSubmitOn') : t('admin.canSubmitOff') }}
                </span>
              </td>
              <td class="px-4 py-3 text-center hidden xl:table-cell">
                <span
                  v-if="u.syncProviders && u.syncProviders.length > 0"
                  class="text-xs px-2 py-1 rounded-full"
                  :class="syncStatusColor(u.syncProviders[0]?.syncStatus ?? '')"
                >
                  {{
                    u.syncProviders[0]?.syncStatus === 'synced'
                      ? t('admin.syncSynced')
                      : u.syncProviders[0]?.syncStatus === 'pending'
                        ? t('admin.syncPending')
                        : t('admin.syncFailed')
                  }}
                </span>
                <span v-else class="text-xs text-zinc-400">-</span>
              </td>
              <td class="px-4 py-3 text-center">
                <button
                  class="w-2.5 h-2.5 rounded-full transition-colors"
                  :class="u.isActive ? 'bg-green-500 hover:bg-green-400' : 'bg-red-400 hover:bg-red-300'"
                  @click="toggleActive(u)"
                />
                <span
                  v-if="u.expiresAt && u.role !== 'admin'"
                  class="block text-[10px] mt-0.5 leading-tight"
                  :class="new Date(u.expiresAt) < new Date() ? 'text-red-400' : 'text-amber-400'"
                >
                  {{ formatDate(u.expiresAt) }}
                </span>
              </td>
              <td class="px-4 py-3 text-sm text-zinc-400 dark:text-zinc-500 hidden xl:table-cell">
                {{ formatDate(u.createdAt) }}
              </td>
              <td class="px-4 py-3 text-right">
                <div class="flex items-center justify-end gap-1">
                  <UButton icon="i-lucide-pencil" variant="ghost" size="xs" @click="openEdit(u)" />
                  <UButton
                    v-if="u.role !== 'admin'"
                    icon="i-lucide-trash-2"
                    variant="ghost"
                    color="error"
                    size="xs"
                    @click="deleteUser(u.id)"
                  />
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <UModal v-model:open="showModal" :title="editingUser ? t('admin.editUser') : t('admin.createUser')">
      <template #body>
        <form class="space-y-4" @submit.prevent="saveUser">
          <UFormField :label="t('admin.username')">
            <UInput v-model="form.username" :disabled="!!editingUser" class="w-full" />
          </UFormField>

          <UFormField :label="editingUser ? t('admin.newPassword') : t('admin.password')">
            <UInput v-model="form.password" type="password" class="w-full" />
          </UFormField>

          <UFormField :label="t('admin.tableRole')">
            <USelect v-model="form.role" :items="roleOptions" class="w-full" />
          </UFormField>

          <div class="grid grid-cols-3 gap-3">
            <UFormField :label="t('admin.dailyLimit')">
              <UInput v-model.number="form.dailyDownloadLimit" type="number" class="w-full" />
            </UFormField>

            <UFormField :label="t('admin.activeLimit')">
              <UInput v-model.number="form.activeTorrentLimit" type="number" class="w-full" />
            </UFormField>

            <UFormField :label="t('admin.maxSizeGB')">
              <UInput v-model.number="form.maxTorrentSizeGb" type="number" class="w-full" />
            </UFormField>
          </div>

          <UFormField :label="t('admin.privateTrackerLimit')">
            <UInput v-model.number="form.privateTrackerLimit" type="number" class="w-full" />
          </UFormField>

          <UFormField :label="t('admin.maxSessions')">
            <UInput v-model.number="form.maxSessions" type="number" class="w-full" />
          </UFormField>

          <UFormField :label="t('admin.discordId')" :description="t('admin.discordIdDesc')">
            <UInput v-model="form.discordId" :placeholder="'123456789012345678'" class="w-full" />
          </UFormField>

          <UFormField :label="t('admin.canSubmit')">
            <USwitch v-model="form.canSubmit" />
          </UFormField>

          <UFormField :label="t('admin.expiresAt')" :description="t('admin.expiresAtDesc')">
            <div class="flex items-center gap-2">
              <input
                type="date"
                :value="toLocalDateString(form.expiresAt)"
                class="flex-1 h-9 px-3 rounded-lg bg-white dark:bg-white/5 border border-zinc-200 dark:border-white/10 text-sm text-zinc-900 dark:text-white"
                @input="onExpiresAtInput"
              />
              <UButton
                v-if="form.expiresAt"
                variant="ghost"
                size="xs"
                icon="i-lucide-x"
                :label="t('admin.expiresAtClear')"
                @click="form.expiresAt = null"
              />
            </div>
          </UFormField>

          <AdminJellyfinUserFields
            v-model:jellyfin-library-access="form.jellyfinLibraryAccess"
            v-model:jellyfin-enable-video-transcoding="form.jellyfinEnableVideoTranscoding"
            v-model:jellyfin-enable-audio-transcoding="form.jellyfinEnableAudioTranscoding"
            v-model:jellyfin-enable-remuxing="form.jellyfinEnableRemuxing"
            v-model:jellyfin-enable-live-tv-access="form.jellyfinEnableLiveTvAccess"
            v-model:jellyfin-enable-live-tv-management="form.jellyfinEnableLiveTvManagement"
            v-model:jellyfin-max-active-sessions="form.jellyfinMaxActiveSessions"
            :editing="!!editingUser"
            :avatar-url="editingUser?.avatarUrl"
            :username="form.username"
            @update:avatar="pendingAvatarFile = $event"
            @update:avatar-removed="pendingAvatarRemoved = $event"
          />

          <UAlert v-if="error" :description="error" color="error" variant="subtle" />

          <div class="flex justify-end gap-2 pt-2">
            <UButton variant="ghost" :label="t('admin.cancel')" @click="showModal = false" />
            <UButton
              type="submit"
              :loading="saving"
              :label="editingUser ? t('admin.saveChanges') : t('admin.createUser')"
            />
          </div>
        </form>
      </template>
    </UModal>
  </div>
</template>
