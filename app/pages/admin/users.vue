<script setup lang="ts">
interface AdminUser {
  id: string
  username: string
  role: string
  isActive: boolean
  dailyDownloadLimit: number
  activeTorrentLimit: number
  maxTorrentSizeGb: number
  privateTrackerLimit: number
  downloadsToday: number
  createdAt: string
}

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
  privateTrackerLimit: 5
})
const saving = ref(false)
const error = ref('')

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

function openCreate() {
  editingUser.value = null
  form.username = ''
  form.password = ''
  form.role = 'user'
  form.dailyDownloadLimit = 5
  form.activeTorrentLimit = 3
  form.maxTorrentSizeGb = 20
  form.privateTrackerLimit = 5
  error.value = ''
  showModal.value = true
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
        privateTrackerLimit: form.privateTrackerLimit
      }
      if (form.password) body.password = form.password
      if (form.username !== editingUser.value.username) body.username = form.username

      await $fetch(`/api/admin/users/${editingUser.value.id}`, {
        method: 'PUT',
        body
      })
    } else {
      await $fetch('/api/admin/users', {
        method: 'POST',
        body: { ...form }
      })
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

function formatDate(dateStr: string): string {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString()
}

const roleOptions = computed(() => [
  { label: t('admin.roleUser'), value: 'user' },
  { label: t('admin.roleAdmin'), value: 'admin' }
])
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
                  <UAvatar :alt="u.username" size="sm" />
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
              <td class="px-4 py-3 text-center">
                <button
                  class="w-2.5 h-2.5 rounded-full transition-colors"
                  :class="u.isActive ? 'bg-green-500 hover:bg-green-400' : 'bg-red-400 hover:bg-red-300'"
                  @click="toggleActive(u)"
                />
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
