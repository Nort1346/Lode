<script setup lang="ts">
interface Request {
  id: string
  userId: string
  username: string
  mediaType: 'movie' | 'tv'
  mediaId: number
  mediaTitle: string
  mediaPoster: string | null
  status: 'pending' | 'accepted' | 'rejected'
  note: string | null
  createdAt: string
}

definePageMeta({
  middleware: ['auth', 'admin'],
  layout: 'default'
})

const { t } = useI18n()
const items = ref<Request[]>([])
const loading = ref(true)
const page = ref(1)
const totalPages = ref(1)
const total = ref(0)
const filterStatus = ref('all')

const STATUS_OPTIONS = computed(() => [
  { value: 'all', label: t('requests.filterAll') },
  { value: 'pending', label: t('requests.filterPending') },
  { value: 'accepted', label: t('requests.filterAccepted') },
  { value: 'rejected', label: t('requests.filterRejected') }
])

const rejectModalOpen = ref(false)
const rejectNote = ref('')
const rejectId = ref<string | null>(null)
const processingId = ref<string | null>(null)

async function fetchRequests() {
  loading.value = true
  try {
    const params = new URLSearchParams()
    params.set('page', String(page.value))
    if (filterStatus.value !== 'all') params.set('status', filterStatus.value)

    const res = await $fetch<{ items: Request[]; page: number; totalPages: number; total: number }>(
      `/api/requests/list?${params.toString()}`
    )
    items.value = res.items
    page.value = res.page
    totalPages.value = res.totalPages
    total.value = res.total
  } catch {
    // silently fail
  } finally {
    loading.value = false
  }
}

onMounted(fetchRequests)

function applyFilters() {
  page.value = 1
  fetchRequests()
}

function nextPage() {
  if (page.value < totalPages.value) {
    page.value++
    fetchRequests()
  }
}

function prevPage() {
  if (page.value > 1) {
    page.value--
    fetchRequests()
  }
}

function formatDate(dateStr: string): string {
  if (!dateStr) return '-'
  return new Date(dateStr).toLocaleDateString()
}

function statusColor(status: string): string {
  const map: Record<string, string> = {
    pending: 'amber',
    accepted: 'green',
    rejected: 'red'
  }
  return map[status] ?? 'zinc'
}

function statusLabel(status: string): string {
  const map: Record<string, string> = {
    pending: 'requests.pending',
    accepted: 'requests.accepted',
    rejected: 'requests.rejected'
  }
  const key = map[status]
  return key ? t(key) : status
}

function typeLabel(mediaType: string): string {
  return mediaType === 'movie' ? t('mediaCard.movie') : t('mediaCard.tv')
}

async function acceptRequest(id: string) {
  processingId.value = id
  try {
    await $fetch(`/api/requests/${id}`, {
      method: 'PATCH',
      body: { status: 'accepted' }
    })
    await fetchRequests()
  } catch {
    // silently fail
  } finally {
    processingId.value = null
  }
}

function openRejectModal(id: string) {
  rejectId.value = id
  rejectNote.value = ''
  rejectModalOpen.value = true
}

async function confirmReject() {
  if (!rejectId.value) return
  processingId.value = rejectId.value
  try {
    await $fetch(`/api/requests/${rejectId.value}`, {
      method: 'PATCH',
      body: {
        status: 'rejected',
        note: rejectNote.value || undefined
      }
    })
    rejectModalOpen.value = false
    await fetchRequests()
  } catch {
    // silently fail
  } finally {
    processingId.value = null
    rejectId.value = null
  }
}
</script>

<template>
  <div>
    <div class="mb-8">
      <h1 class="text-3xl font-bold text-zinc-900 dark:text-white mb-2">{{ t('requests.title') }}</h1>
      <p class="text-zinc-500 dark:text-zinc-400">{{ t('requests.subtitle') }}</p>
    </div>

    <div class="card p-5 mb-6">
      <div class="flex flex-col sm:flex-row gap-3">
        <USelect v-model="filterStatus" :items="STATUS_OPTIONS" class="w-full sm:w-48" />
        <UButton :label="t('common.apply')" icon="i-lucide-search" @click="applyFilters" />
      </div>
    </div>

    <div v-if="loading" class="flex justify-center py-16">
      <UIcon name="i-lucide-loader-2" class="w-8 h-8 text-amber-500 dark:text-amber-400 animate-spin" />
    </div>

    <div v-else-if="items.length === 0" class="card p-12 text-center">
      <UIcon name="i-lucide-inbox" class="w-12 h-12 text-zinc-300 dark:text-zinc-600 mx-auto mb-4" />
      <p class="text-zinc-500 dark:text-zinc-400">{{ t('requests.noRequests') }}</p>
    </div>

    <div v-else class="card overflow-hidden">
      <div class="overflow-x-auto">
        <table class="w-full">
          <thead>
            <tr class="table-header">
              <th class="px-4 py-3 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase">
                {{ t('requests.tableUser') }}
              </th>
              <th class="px-4 py-3 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase">
                {{ t('requests.tableTitle') }}
              </th>
              <th class="px-4 py-3 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase">
                {{ t('requests.tableType') }}
              </th>
              <th class="px-4 py-3 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase">
                {{ t('requests.tableStatus') }}
              </th>
              <th class="px-4 py-3 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase">
                {{ t('requests.tableDate') }}
              </th>
              <th class="px-4 py-3 text-right text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase">
                {{ t('requests.tableActions') }}
              </th>
            </tr>
          </thead>
          <tbody class="divide-y divide-zinc-200 dark:divide-white/5">
            <tr v-for="req in items" :key="req.id" class="table-row">
              <td class="px-4 py-3 text-sm font-medium text-zinc-900 dark:text-white">
                {{ req.username }}
              </td>
              <td class="px-4 py-3">
                <div class="flex items-center gap-3">
                  <img
                    v-if="req.mediaPoster"
                    :src="req.mediaPoster"
                    :alt="req.mediaTitle"
                    class="w-8 h-12 rounded object-cover flex-shrink-0"
                  />
                  <span class="text-sm text-zinc-700 dark:text-zinc-300 line-clamp-1">{{ req.mediaTitle }}</span>
                </div>
              </td>
              <td class="px-4 py-3 text-sm text-zinc-500 dark:text-zinc-400">
                {{ typeLabel(req.mediaType) }}
              </td>
              <td class="px-4 py-3">
                <span
                  class="text-xs font-medium px-2 py-1 rounded-full"
                  :class="`bg-${statusColor(req.status)}-500/15 text-${statusColor(req.status)}-700 dark:text-${statusColor(req.status)}-400`"
                >
                  {{ statusLabel(req.status) }}
                </span>
              </td>
              <td class="px-4 py-3 text-sm text-zinc-500 dark:text-zinc-400 whitespace-nowrap">
                {{ formatDate(req.createdAt) }}
              </td>
              <td class="px-4 py-3 text-right">
                <div v-if="req.status === 'pending'" class="flex items-center justify-end gap-2">
                  <UButton
                    size="xs"
                    color="success"
                    variant="soft"
                    icon="i-lucide-check"
                    :loading="processingId === req.id"
                    @click="acceptRequest(req.id)"
                  >
                    {{ t('requests.accept') }}
                  </UButton>
                  <UButton
                    size="xs"
                    color="error"
                    variant="soft"
                    icon="i-lucide-x"
                    :loading="processingId === req.id"
                    @click="openRejectModal(req.id)"
                  >
                    {{ t('requests.reject') }}
                  </UButton>
                </div>
                <span v-else-if="req.note" class="text-xs text-zinc-400 dark:text-zinc-500 italic line-clamp-1">
                  {{ req.note }}
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="flex items-center justify-between px-4 py-3 border-t border-zinc-200 dark:border-white/5">
        <span class="text-sm text-zinc-500 dark:text-zinc-400">
          {{ t('requests.pageInfo', { page, total: totalPages, count: total }) }}
        </span>
        <div class="flex gap-2">
          <UButton :label="t('requests.previous')" variant="soft" :disabled="page <= 1" @click="prevPage" />
          <UButton :label="t('requests.next')" variant="soft" :disabled="page >= totalPages" @click="nextPage" />
        </div>
      </div>
    </div>

    <UModal v-model:open="rejectModalOpen">
      <template #header>
        <h3 class="text-lg font-semibold text-zinc-900 dark:text-white">{{ t('requests.reject') }}</h3>
      </template>
      <template #body>
        <UFormField :label="t('requests.rejectNote')">
          <UInput v-model="rejectNote" :placeholder="t('requests.rejectNote')" class="w-full" />
        </UFormField>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton :label="t('common.cancel')" variant="soft" @click="rejectModalOpen = false" />
          <UButton
            :label="t('requests.reject')"
            color="error"
            :loading="processingId === rejectId"
            @click="confirmReject"
          />
        </div>
      </template>
    </UModal>
  </div>
</template>
