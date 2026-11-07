<script setup lang="ts">
import type {
  IndexerDefinitionDetail,
  IndexerDefinitionResponse,
  IndexerDefinitionSummary,
  IndexerDetailResponse,
  IndexerEditorData,
  IndexerField,
  IndexerListResponse,
  IndexerMetaResponse,
  IndexerSaveBody,
  IndexerSummary,
  IndexerTestBody,
  IndexerTestResult,
  IndexerValidationFailure
} from '#shared/indexers'
import type { SkeletonColumn } from '~/types/skeleton'
import type { IndexerFormState, IndexerTrackerFormState } from '~/types/indexers'
import {
  buildCreateForm,
  buildEditForm,
  buildIndexerPayload,
  buildTrackerLink,
  emptyIndexerForm,
  emptyTrackerForm,
  fieldsForDisplay,
  findBaseUrl,
  toTrackerForm
} from '~/utils/indexer-form'

definePageMeta({
  middleware: ['auth', 'admin'],
  layout: 'default'
})

const { t, locale } = useI18n()
const toast = useToast()
const { confirm } = useConfirmDialog()

const indexers = ref<IndexerSummary[]>([])
const loading = ref(true)
const listError = ref('')
const meta = ref<IndexerMetaResponse>({ appProfiles: [], tags: [], version: null })

const filters = reactive({
  q: '',
  privacy: 'all',
  protocol: 'all',
  status: 'all'
})

const selectedIds = ref<number[]>([])
const testingIds = ref<number[]>([])
const testingAll = ref(false)
const testResults = ref<Record<number, IndexerTestResult>>({})
const togglingIds = ref<number[]>([])
const deletingIds = ref<number[]>([])
const bulkBusy = ref(false)

const modalOpen = ref(false)
const modalMode = ref<'create' | 'edit'>('create')
const step = ref<1 | 2>(1)
const editingId = ref<number | null>(null)
const selectedDefinition = ref<IndexerDefinitionDetail | null>(null)
const editorFields = ref<IndexerField[]>([])
const editorUrls = ref<string[]>([])
const editorPrivacy = ref('private')
const definitionLoading = ref(false)
const loadingIndexer = ref(false)
const form = ref<IndexerFormState>(emptyIndexerForm())
const trackerForm = ref<IndexerTrackerFormState>(emptyTrackerForm())
const currentTracker = ref<IndexerDetailResponse['tracker']>(null)
const formError = ref('')
const formFailures = ref<IndexerValidationFailure[]>([])
const formTestResult = ref<IndexerTestResult | null>(null)
const saving = ref(false)
const testingForm = ref(false)
const captchaImage = ref<string | null>(null)
const captchaLoading = ref(false)

const SKELETON_COLUMNS: SkeletonColumn[] = [
  { type: 'text', width: 'w-4' },
  { type: 'text', width: 'w-40' },
  { type: 'badge', width: 'w-16', hidden: 'hidden md:table-cell' },
  { type: 'badge', width: 'w-16', hidden: 'hidden lg:table-cell' },
  { type: 'badge', width: 'w-20', hidden: 'hidden xl:table-cell' },
  { type: 'text', width: 'w-24', hidden: 'hidden xl:table-cell' },
  { type: 'toggle' },
  { type: 'actions', actionsCount: 3 }
]

const privacyItems = computed(() => [
  { label: t('indexers.filterAllPrivacy'), value: 'all' },
  { label: t('indexers.privacyPublic'), value: 'public' },
  { label: t('indexers.privacySemiPrivate'), value: 'semiPrivate' },
  { label: t('indexers.privacyPrivate'), value: 'private' }
])

const protocolItems = computed(() => [
  { label: t('indexers.filterAllProtocol'), value: 'all' },
  { label: t('indexers.protocolTorrent'), value: 'torrent' },
  { label: t('indexers.protocolUsenet'), value: 'usenet' }
])

const statusItems = computed(() => [
  { label: t('indexers.filterAllStatus'), value: 'all' },
  { label: t('indexers.statusEnabled'), value: 'enabled' },
  { label: t('indexers.statusDisabled'), value: 'disabled' },
  { label: t('indexers.statusBlocked'), value: 'blocked' },
  { label: t('indexers.statusLinked'), value: 'linked' }
])

const appProfileItems = computed(() =>
  meta.value.appProfiles.map((profile) => ({ label: profile.name, value: profile.id }))
)

const tagItems = computed(() => meta.value.tags.map((tag) => ({ label: tag.label, value: tag.id })))

const summaryStats = computed(() => ({
  total: indexers.value.length,
  enabled: indexers.value.filter((indexer) => indexer.enable).length,
  privateCount: indexers.value.filter((indexer) => indexer.privacy !== 'public').length,
  blocked: indexers.value.filter((indexer) => indexer.disabledByProwlarr).length,
  linked: indexers.value.filter((indexer) => indexer.tracker !== null).length
}))

const filteredIndexers = computed(() => {
  const q = filters.q.trim().toLowerCase()
  return indexers.value.filter((indexer) => {
    if (q.length > 0) {
      const haystack = `${indexer.name} ${indexer.definitionName} ${indexer.language ?? ''}`.toLowerCase()
      if (!haystack.includes(q)) return false
    }
    if (filters.privacy !== 'all' && indexer.privacy !== filters.privacy) return false
    if (filters.protocol !== 'all' && indexer.protocol !== filters.protocol) return false
    if (filters.status === 'enabled' && !indexer.enable) return false
    if (filters.status === 'disabled' && indexer.enable) return false
    if (filters.status === 'blocked' && !indexer.disabledByProwlarr) return false
    if (filters.status === 'linked' && indexer.tracker === null) return false
    return true
  })
})

const selectedCount = computed(() => selectedIds.value.length)
const allSelected = computed(
  () => filteredIndexers.value.length > 0 && filteredIndexers.value.every((indexer) => isSelected(indexer.id))
)

const fieldGroups = computed(() => {
  if (modalMode.value === 'create') {
    if (selectedDefinition.value === null) return { normal: [], advanced: [] }
    return fieldsForDisplay(selectedDefinition.value.fields, selectedDefinition.value.indexerUrls)
  }
  return fieldsForDisplay(editorFields.value, editorUrls.value)
})

const trackerVisible = computed(() => {
  const privacy = modalMode.value === 'create' ? selectedDefinition.value?.privacy : editorPrivacy.value
  return privacy !== undefined && privacy !== 'public'
})

const modalTitle = computed(() => {
  if (modalMode.value === 'edit') return t('indexers.formEditTitle')
  if (step.value === 1) return t('indexers.formChooseDefinitionTitle')
  return t('indexers.formCreateTitle', { name: selectedDefinition.value?.name ?? '' })
})

const canSubmitForm = computed(
  () => form.value.name.trim().length > 0 && form.value.appProfileId > 0 && !saving.value && !loadingIndexer.value
)

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function extractValidationFailures(error: unknown): IndexerValidationFailure[] {
  if (!isRecord(error)) return []
  const body = error.data
  if (!isRecord(body)) return []
  const inner = body.data
  if (!isRecord(inner)) return []
  const failures = inner.failures
  if (!Array.isArray(failures)) return []

  const parsed: IndexerValidationFailure[] = []
  for (const failure of failures) {
    if (!isRecord(failure) || typeof failure.errorMessage !== 'string') continue
    parsed.push({
      errorMessage: failure.errorMessage,
      propertyName: typeof failure.propertyName === 'string' ? failure.propertyName : undefined,
      severity: typeof failure.severity === 'string' ? failure.severity : undefined,
      isWarning: typeof failure.isWarning === 'boolean' ? failure.isWarning : undefined
    })
  }
  return parsed
}

async function fetchIndexers(showSkeleton = true) {
  if (showSkeleton) loading.value = true
  listError.value = ''
  try {
    const res = await $fetch<IndexerListResponse>('/api/admin/indexers')
    indexers.value = res.indexers
    selectedIds.value = selectedIds.value.filter((id) => res.indexers.some((indexer) => indexer.id === id))
  } catch (error: unknown) {
    const friendly = describeApiError(error, t)
    listError.value = getApiStatusCode(error) === 503 ? t('indexers.notConfigured') : friendly.description
  } finally {
    loading.value = false
  }
}

async function fetchMeta() {
  try {
    meta.value = await $fetch<IndexerMetaResponse>('/api/admin/indexers/meta')
  } catch {
    // Meta is optional for the list; the form falls back to app profile 1.
  }
}

onMounted(() => {
  void fetchIndexers()
  void fetchMeta()
})

function privacyLabel(value: string): string {
  if (value === 'public') return t('indexers.privacyPublic')
  if (value === 'semiPrivate') return t('indexers.privacySemiPrivate')
  return t('indexers.privacyPrivate')
}

function privacyClass(value: string): string {
  if (value === 'public') return 'bg-green-500/15 text-green-700 dark:text-green-400'
  if (value === 'semiPrivate') return 'bg-amber-500/15 text-amber-700 dark:text-amber-400'
  return 'bg-violet-500/15 text-violet-700 dark:text-violet-400'
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat(locale.value).format(value)
}

function isSelected(id: number): boolean {
  return selectedIds.value.includes(id)
}

function toggleSelected(id: number) {
  selectedIds.value = isSelected(id)
    ? selectedIds.value.filter((selected) => selected !== id)
    : [...selectedIds.value, id]
}

function toggleAll() {
  if (allSelected.value) {
    const visible = new Set(filteredIndexers.value.map((indexer) => indexer.id))
    selectedIds.value = selectedIds.value.filter((id) => !visible.has(id))
    return
  }
  const merged = new Set([...selectedIds.value, ...filteredIndexers.value.map((indexer) => indexer.id)])
  selectedIds.value = [...merged]
}

function clearSelection() {
  selectedIds.value = []
}

function isTesting(id: number): boolean {
  return testingIds.value.includes(id)
}

function isToggling(id: number): boolean {
  return togglingIds.value.includes(id)
}

function isDeleting(id: number): boolean {
  return deletingIds.value.includes(id)
}

function testResultFor(id: number): IndexerTestResult | null {
  return testResults.value[id] ?? null
}

function testTooltip(id: number): string {
  const result = testResultFor(id)
  if (result === null) return ''
  if (result.isValid) return t('indexers.testValid')
  return result.validationFailures.map((failure) => failure.errorMessage).join('\n')
}

async function toggleEnabled(indexer: IndexerSummary) {
  if (isToggling(indexer.id)) return
  togglingIds.value = [...togglingIds.value, indexer.id]
  try {
    await $fetch(`/api/admin/indexers/${indexer.id}`, {
      method: 'PATCH',
      body: { enable: !indexer.enable }
    })
    indexer.enable = !indexer.enable
  } catch (error: unknown) {
    toast.add({ title: t('common.error'), description: describeApiError(error, t).description, color: 'error' })
  } finally {
    togglingIds.value = togglingIds.value.filter((id) => id !== indexer.id)
  }
}

async function testIndexer(indexer: IndexerSummary) {
  if (isTesting(indexer.id)) return
  testingIds.value = [...testingIds.value, indexer.id]
  try {
    const body: IndexerTestBody = { id: indexer.id }
    const result = await $fetch<IndexerTestResult>('/api/admin/indexers/test', { method: 'POST', body })
    testResults.value = { ...testResults.value, [indexer.id]: result }
    toast.add({
      title: result.isValid ? t('indexers.testValid') : t('indexers.testInvalid'),
      description: indexer.name,
      color: result.isValid ? 'success' : 'error'
    })
  } catch (error: unknown) {
    toast.add({ title: t('common.error'), description: describeApiError(error, t).description, color: 'error' })
  } finally {
    testingIds.value = testingIds.value.filter((id) => id !== indexer.id)
  }
}

async function testAll() {
  testingAll.value = true
  try {
    const res = await $fetch<{ results: IndexerTestResult[] }>('/api/admin/indexers/test-all', { method: 'POST' })
    const next: Record<number, IndexerTestResult> = { ...testResults.value }
    for (const result of res.results) {
      if (result.id !== undefined) next[result.id] = result
    }
    testResults.value = next
    const valid = res.results.filter((result) => result.isValid).length
    toast.add({
      title: t('indexers.testAllTitle'),
      description: t('indexers.testAllSummary', { valid, total: res.results.length }),
      color: valid === res.results.length ? 'success' : 'warning'
    })
  } catch (error: unknown) {
    toast.add({ title: t('common.error'), description: describeApiError(error, t).description, color: 'error' })
  } finally {
    testingAll.value = false
  }
}

async function deleteIndexer(indexer: IndexerSummary) {
  const confirmed = await confirm({
    title: t('indexers.deleteConfirmTitle'),
    description: t('indexers.deleteConfirm', { name: indexer.name }),
    confirmLabel: t('common.delete'),
    cancelLabel: t('common.cancel')
  })
  if (!confirmed) return

  deletingIds.value = [...deletingIds.value, indexer.id]
  try {
    await $fetch(`/api/admin/indexers/${indexer.id}`, { method: 'DELETE' })
    toast.add({ title: t('indexers.deleteSuccess'), description: indexer.name, color: 'success' })
    await fetchIndexers(false)
  } catch (error: unknown) {
    toast.add({ title: t('common.error'), description: describeApiError(error, t).description, color: 'error' })
  } finally {
    deletingIds.value = deletingIds.value.filter((id) => id !== indexer.id)
  }
}

async function bulkSetEnabled(enable: boolean) {
  if (selectedIds.value.length === 0) return
  bulkBusy.value = true
  const count = selectedIds.value.length
  try {
    await $fetch('/api/admin/indexers/bulk', {
      method: 'PUT',
      body: { ids: selectedIds.value, enable }
    })
    toast.add({
      title: enable ? t('indexers.bulkEnabled') : t('indexers.bulkDisabled'),
      description: t('indexers.bulkCount', { count }),
      color: 'success'
    })
    clearSelection()
    await fetchIndexers(false)
  } catch (error: unknown) {
    toast.add({ title: t('common.error'), description: describeApiError(error, t).description, color: 'error' })
  } finally {
    bulkBusy.value = false
  }
}

async function bulkDelete() {
  if (selectedIds.value.length === 0) return
  const count = selectedIds.value.length
  const confirmed = await confirm({
    title: t('indexers.bulkDeleteConfirmTitle'),
    description: t('indexers.bulkDeleteConfirm', { count }),
    confirmLabel: t('common.delete'),
    cancelLabel: t('common.cancel')
  })
  if (!confirmed) return

  bulkBusy.value = true
  try {
    await $fetch('/api/admin/indexers/bulk', {
      method: 'DELETE',
      body: { ids: selectedIds.value }
    })
    toast.add({ title: t('indexers.deleteSuccess'), description: t('indexers.bulkCount', { count }), color: 'success' })
    clearSelection()
    await fetchIndexers(false)
  } catch (error: unknown) {
    toast.add({ title: t('common.error'), description: describeApiError(error, t).description, color: 'error' })
  } finally {
    bulkBusy.value = false
  }
}

function defaultAppProfileId(): number {
  return meta.value.appProfiles[0]?.id ?? 1
}

function resetFormState() {
  form.value = emptyIndexerForm()
  trackerForm.value = emptyTrackerForm()
  currentTracker.value = null
  formError.value = ''
  formFailures.value = []
  formTestResult.value = null
  captchaImage.value = null
  editorFields.value = []
  editorUrls.value = []
  editorPrivacy.value = 'private'
}

function openCreate() {
  resetFormState()
  modalMode.value = 'create'
  editingId.value = null
  selectedDefinition.value = null
  step.value = 1
  modalOpen.value = true
}

async function selectDefinition(summary: IndexerDefinitionSummary) {
  definitionLoading.value = true
  formError.value = ''
  try {
    const res = await $fetch<IndexerDefinitionResponse>(
      `/api/admin/indexers/schema/${encodeURIComponent(summary.definitionName)}`
    )
    selectedDefinition.value = res.definition
    form.value = buildCreateForm(res.definition, defaultAppProfileId())
    trackerForm.value = emptyTrackerForm()
    trackerForm.value.loginUrl = findBaseUrl(form.value.fields)
    currentTracker.value = null
    formFailures.value = []
    formTestResult.value = null
    captchaImage.value = null
    step.value = 2
  } catch (error: unknown) {
    formError.value = describeApiError(error, t).description
  } finally {
    definitionLoading.value = false
  }
}

async function openEdit(indexer: IndexerSummary) {
  resetFormState()
  modalMode.value = 'edit'
  editingId.value = indexer.id
  step.value = 2
  modalOpen.value = true
  loadingIndexer.value = true

  try {
    const res = await $fetch<IndexerDetailResponse>(`/api/admin/indexers/${indexer.id}`)
    const editor: IndexerEditorData = res.indexer
    editorFields.value = editor.fields
    editorUrls.value = editor.indexerUrls
    editorPrivacy.value = editor.privacy
    form.value = buildEditForm(editor)
    currentTracker.value = res.tracker
    trackerForm.value = toTrackerForm(res.tracker)
    if (!trackerForm.value.enabled) trackerForm.value.loginUrl = findBaseUrl(form.value.fields)
  } catch (error: unknown) {
    formError.value = describeApiError(error, t).description
  } finally {
    loadingIndexer.value = false
  }
}

function onPriorityInput(value: string | number) {
  const parsed = Number(value)
  form.value.priority = Number.isFinite(parsed) ? Math.max(1, Math.min(50, Math.trunc(parsed))) : 25
}

function onAppProfileInput(value: unknown) {
  const parsed = typeof value === 'number' ? value : Number(value)
  form.value.appProfileId = Number.isFinite(parsed) ? parsed : 0
}

watch(
  () => trackerForm.value.enabled,
  (enabled) => {
    if (enabled && trackerForm.value.loginUrl.trim().length === 0) {
      trackerForm.value.loginUrl = findBaseUrl(form.value.fields)
    }
  }
)

watch(
  () => trackerForm.value.authMethod,
  (method) => {
    if (method === 'login' && trackerForm.value.loginUrl.trim().length === 0) {
      trackerForm.value.loginUrl = findBaseUrl(form.value.fields)
    }
  }
)

function buildTestBody(): IndexerTestBody {
  const body: IndexerTestBody = {
    indexer: buildIndexerPayload(form.value, modalMode.value === 'create' ? selectedDefinition.value : null)
  }
  if (editingId.value !== null) body.id = editingId.value
  return body
}

async function requestCaptcha() {
  captchaLoading.value = true
  try {
    const res = await $fetch<{ captchaRequest: { contentType: string; imageData: string } | null }>(
      '/api/admin/indexers/captcha',
      { method: 'POST', body: buildTestBody() }
    )
    if (res.captchaRequest === null) {
      captchaImage.value = null
      toast.add({ title: t('indexers.captchaEmpty'), color: 'warning' })
      return
    }
    captchaImage.value = `data:${res.captchaRequest.contentType};base64,${res.captchaRequest.imageData}`
  } catch (error: unknown) {
    toast.add({ title: t('common.error'), description: describeApiError(error, t).description, color: 'error' })
  } finally {
    captchaLoading.value = false
  }
}

async function testForm() {
  testingForm.value = true
  formTestResult.value = null
  formFailures.value = []
  try {
    formTestResult.value = await $fetch<IndexerTestResult>('/api/admin/indexers/test', {
      method: 'POST',
      body: buildTestBody()
    })
  } catch (error: unknown) {
    formError.value = describeApiError(error, t).description
    formFailures.value = extractValidationFailures(error)
  } finally {
    testingForm.value = false
  }
}

async function save() {
  if (!canSubmitForm.value) return
  saving.value = true
  formError.value = ''
  formFailures.value = []
  try {
    const body: IndexerSaveBody = {
      indexer: buildIndexerPayload(form.value, modalMode.value === 'create' ? selectedDefinition.value : null),
      tracker: trackerVisible.value ? buildTrackerLink(trackerForm.value) : null
    }

    if (modalMode.value === 'edit' && editingId.value !== null) {
      await $fetch(`/api/admin/indexers/${editingId.value}`, { method: 'PUT', body })
    } else {
      await $fetch('/api/admin/indexers', { method: 'POST', body })
    }

    modalOpen.value = false
    toast.add({ title: t('indexers.saveSuccess'), description: form.value.name, color: 'success' })
    await fetchIndexers(false)
  } catch (error: unknown) {
    formError.value = describeApiError(error, t).description
    formFailures.value = extractValidationFailures(error)
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div>
    <div v-reveal class="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 class="text-3xl font-bold text-zinc-900 dark:text-white mb-2">{{ t('indexers.title') }}</h1>
        <p class="text-zinc-500 dark:text-zinc-400">{{ t('indexers.subtitle') }}</p>
      </div>
      <div class="flex items-center gap-2">
        <UButton
          icon="i-lucide-refresh-cw"
          variant="outline"
          size="sm"
          :loading="loading"
          :label="t('indexers.refresh')"
          @click="fetchIndexers()"
        />
        <UButton icon="i-lucide-plus" :label="t('indexers.addIndexer')" @click="openCreate" />
      </div>
    </div>

    <div v-reveal="'fade'" class="card p-5 mb-6">
      <div class="flex items-start gap-3">
        <UIcon name="i-lucide-info" class="w-5 h-5 text-amber-500 mt-0.5 shrink-0" />
        <div class="text-sm text-zinc-600 dark:text-zinc-400">
          <p>{{ t('indexers.info') }}</p>
          <p v-if="meta.version" class="mt-1 text-xs text-zinc-500 dark:text-zinc-500">
            {{ t('indexers.versionLabel', { version: meta.version }) }}
          </p>
        </div>
      </div>
    </div>

    <div v-if="!loading && indexers.length > 0" class="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
      <div class="card p-3">
        <p class="text-xs text-zinc-500 dark:text-zinc-400">{{ t('indexers.summaryTotal') }}</p>
        <p class="text-xl font-bold text-zinc-900 dark:text-white">{{ summaryStats.total }}</p>
      </div>
      <div class="card p-3">
        <p class="text-xs text-zinc-500 dark:text-zinc-400">{{ t('indexers.summaryEnabled') }}</p>
        <p class="text-xl font-bold text-green-600 dark:text-green-400">{{ summaryStats.enabled }}</p>
      </div>
      <div class="card p-3">
        <p class="text-xs text-zinc-500 dark:text-zinc-400">{{ t('indexers.summaryPrivate') }}</p>
        <p class="text-xl font-bold text-amber-600 dark:text-amber-400">{{ summaryStats.privateCount }}</p>
      </div>
      <div class="card p-3">
        <p class="text-xs text-zinc-500 dark:text-zinc-400">{{ t('indexers.summaryBlocked') }}</p>
        <p class="text-xl font-bold text-red-600 dark:text-red-400">{{ summaryStats.blocked }}</p>
      </div>
      <div class="card p-3">
        <p class="text-xs text-zinc-500 dark:text-zinc-400">{{ t('indexers.summaryLinked') }}</p>
        <p class="text-xl font-bold text-cyan-600 dark:text-cyan-400">{{ summaryStats.linked }}</p>
      </div>
    </div>

    <div v-if="listError" v-reveal="'fade'" class="card p-5 mb-6">
      <UAlert color="error" :title="t('indexers.loadFailed')" :description="listError" />
    </div>

    <div v-reveal="'fade'" class="card p-4 mb-6">
      <div class="flex flex-col xl:flex-row gap-3">
        <UInput
          v-model="filters.q"
          icon="i-lucide-search"
          :placeholder="t('indexers.filterSearchPlaceholder')"
          class="flex-1"
        />
        <USelect v-model="filters.privacy" :items="privacyItems" class="xl:w-44" />
        <USelect v-model="filters.protocol" :items="protocolItems" class="xl:w-40" />
        <USelect v-model="filters.status" :items="statusItems" class="xl:w-44" />
        <UButton
          icon="i-lucide-flask-conical"
          variant="outline"
          :label="t('indexers.testAll')"
          :loading="testingAll"
          :disabled="indexers.length === 0"
          @click="testAll"
        />
      </div>
    </div>

    <div
      v-if="selectedCount > 0"
      v-reveal="'fade'"
      class="card p-3 mb-4 flex flex-wrap items-center justify-between gap-3"
    >
      <span class="text-sm font-medium text-zinc-700 dark:text-zinc-300">
        {{ t('indexers.bulkSelected', { count: selectedCount }) }}
      </span>
      <div class="flex flex-wrap items-center gap-2">
        <UButton
          icon="i-lucide-play"
          size="xs"
          variant="outline"
          :label="t('indexers.bulkEnable')"
          :loading="bulkBusy"
          @click="bulkSetEnabled(true)"
        />
        <UButton
          icon="i-lucide-pause"
          size="xs"
          variant="outline"
          :label="t('indexers.bulkDisable')"
          :loading="bulkBusy"
          @click="bulkSetEnabled(false)"
        />
        <UButton
          icon="i-lucide-trash-2"
          size="xs"
          color="error"
          variant="outline"
          :label="t('indexers.bulkDelete')"
          :loading="bulkBusy"
          @click="bulkDelete"
        />
        <UButton
          icon="i-lucide-x"
          size="xs"
          variant="ghost"
          :label="t('indexers.clearSelection')"
          @click="clearSelection"
        />
      </div>
    </div>

    <AdminTableSkeleton v-if="loading" :columns="SKELETON_COLUMNS" />

    <div v-else-if="indexers.length === 0 && !listError" v-reveal="'fade'" class="card p-12 text-center">
      <UIcon name="i-lucide-server" class="w-12 h-12 text-zinc-300 dark:text-zinc-600 mx-auto mb-4" />
      <p class="text-zinc-500 dark:text-zinc-400 mb-1">{{ t('indexers.noIndexers') }}</p>
      <p class="text-sm text-zinc-400 dark:text-zinc-500 mb-4">{{ t('indexers.noIndexersDesc') }}</p>
      <UButton icon="i-lucide-plus" :label="t('indexers.addIndexer')" @click="openCreate" />
    </div>

    <div v-else-if="filteredIndexers.length === 0" v-reveal="'fade'" class="card p-12 text-center">
      <UIcon name="i-lucide-search-x" class="w-12 h-12 text-zinc-300 dark:text-zinc-600 mx-auto mb-4" />
      <p class="text-zinc-500 dark:text-zinc-400">{{ t('indexers.noResults') }}</p>
    </div>

    <div v-else v-reveal="'fade'" class="card overflow-hidden">
      <div class="overflow-x-auto">
        <table class="w-full">
          <thead>
            <tr class="table-header">
              <th class="px-4 py-3 w-10">
                <UCheckbox :model-value="allSelected" @update:model-value="toggleAll" />
              </th>
              <th class="px-4 py-3 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase">
                {{ t('indexers.tableIndexer') }}
              </th>
              <th
                class="px-4 py-3 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase hidden md:table-cell"
              >
                {{ t('indexers.tablePrivacy') }}
              </th>
              <th
                class="px-4 py-3 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase hidden lg:table-cell"
              >
                {{ t('indexers.tableProtocol') }}
              </th>
              <th
                class="px-4 py-3 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase hidden xl:table-cell"
              >
                {{ t('indexers.tableTracker') }}
              </th>
              <th
                class="px-4 py-3 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase hidden xl:table-cell"
              >
                {{ t('indexers.tableStats') }}
              </th>
              <th class="px-4 py-3 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase">
                {{ t('indexers.tableStatus') }}
              </th>
              <th class="px-4 py-3 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase">
                {{ t('indexers.tableActions') }}
              </th>
            </tr>
          </thead>
          <tbody class="divide-y divide-zinc-200 dark:divide-white/5">
            <tr v-for="indexer in filteredIndexers" :key="indexer.id" class="table-row">
              <td class="px-4 py-3">
                <UCheckbox :model-value="isSelected(indexer.id)" @update:model-value="toggleSelected(indexer.id)" />
              </td>
              <td class="px-4 py-3">
                <div class="flex items-center gap-2">
                  <span class="text-sm font-medium text-zinc-900 dark:text-white">{{ indexer.name }}</span>
                  <UIcon
                    v-if="indexer.disabledByProwlarr"
                    name="i-lucide-triangle-alert"
                    class="w-4 h-4 text-red-500 shrink-0"
                    :title="t('indexers.blockedByProwlarr')"
                  />
                  <UIcon
                    v-if="testResultFor(indexer.id) !== null"
                    :name="testResultFor(indexer.id)?.isValid ? 'i-lucide-circle-check' : 'i-lucide-circle-x'"
                    class="w-4 h-4 shrink-0"
                    :class="testResultFor(indexer.id)?.isValid ? 'text-green-500' : 'text-red-500'"
                    :title="testTooltip(indexer.id)"
                  />
                </div>
                <div class="text-xs text-zinc-500 dark:text-zinc-400 font-mono">{{ indexer.definitionName }}</div>
              </td>
              <td class="px-4 py-3 hidden md:table-cell">
                <span class="px-2 py-0.5 rounded-full text-xs font-medium" :class="privacyClass(indexer.privacy)">
                  {{ privacyLabel(indexer.privacy) }}
                </span>
              </td>
              <td class="px-4 py-3 hidden lg:table-cell">
                <div class="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-300">
                  <span class="px-2 py-0.5 rounded-full text-xs font-medium bg-zinc-500/15">{{
                    indexer.protocol
                  }}</span>
                  <span v-if="indexer.language" class="text-xs text-zinc-400">{{ indexer.language }}</span>
                </div>
              </td>
              <td class="px-4 py-3 hidden xl:table-cell">
                <NuxtLink
                  v-if="indexer.tracker !== null"
                  :to="`/admin/trackers?indexer=${encodeURIComponent(indexer.name)}`"
                  class="inline-flex items-center gap-1 text-xs font-medium text-cyan-600 dark:text-cyan-400 hover:underline"
                >
                  <UIcon name="i-lucide-link" class="w-3.5 h-3.5" />
                  {{
                    indexer.tracker.trackerType === 'guid' ? t('indexers.trackerGuid') : t('indexers.trackerCounting')
                  }}
                </NuxtLink>
                <span v-else class="text-sm text-zinc-400">{{ t('indexers.trackerNone') }}</span>
              </td>
              <td class="px-4 py-3 hidden xl:table-cell text-xs text-zinc-500 dark:text-zinc-400">
                <template v-if="indexer.stats">
                  <div>{{ t('indexers.statsQueries') }}: {{ formatNumber(indexer.stats.queries) }}</div>
                  <div>{{ t('indexers.statsGrabs') }}: {{ formatNumber(indexer.stats.grabs) }}</div>
                </template>
                <span v-else>-</span>
              </td>
              <td class="px-4 py-3">
                <button
                  class="relative inline-flex h-5 w-9 items-center rounded-full transition-colors disabled:opacity-60"
                  :class="indexer.enable ? 'bg-green-500' : 'bg-zinc-300 dark:bg-zinc-600'"
                  :disabled="isToggling(indexer.id)"
                  @click="toggleEnabled(indexer)"
                >
                  <span
                    class="inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform"
                    :class="indexer.enable ? 'translate-x-4.5' : 'translate-x-0.5'"
                  />
                </button>
              </td>
              <td class="px-4 py-3">
                <div class="flex items-center gap-2">
                  <UButton
                    icon="i-lucide-flask-conical"
                    variant="ghost"
                    size="xs"
                    :loading="isTesting(indexer.id)"
                    :title="t('indexers.testAction')"
                    @click="testIndexer(indexer)"
                  />
                  <UButton
                    icon="i-lucide-pencil"
                    variant="ghost"
                    size="xs"
                    :title="t('indexers.editAction')"
                    @click="openEdit(indexer)"
                  />
                  <UButton
                    icon="i-lucide-trash-2"
                    color="error"
                    variant="ghost"
                    size="xs"
                    :loading="isDeleting(indexer.id)"
                    :title="t('indexers.deleteAction')"
                    @click="deleteIndexer(indexer)"
                  />
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <UModal v-model:open="modalOpen" :title="modalTitle" class="max-w-3xl">
      <template #body>
        <AdminIndexersDefinitionPicker v-if="modalMode === 'create' && step === 1" @select="selectDefinition" />

        <div v-else-if="definitionLoading || loadingIndexer" class="py-12 text-center text-zinc-500 dark:text-zinc-400">
          <UIcon name="i-lucide-loader-circle" class="w-6 h-6 animate-spin mx-auto mb-2" />
          {{ t('indexers.loadingForm') }}
        </div>

        <div v-else class="space-y-5">
          <div
            v-if="modalMode === 'create' && selectedDefinition !== null"
            class="rounded-lg border border-zinc-200 dark:border-white/10 p-3"
          >
            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0">
                <div class="flex flex-wrap items-center gap-2">
                  <span class="text-sm font-semibold text-zinc-900 dark:text-white">
                    {{ selectedDefinition.name }}
                  </span>
                  <span
                    class="px-2 py-0.5 rounded-full text-[11px] font-medium"
                    :class="privacyClass(selectedDefinition.privacy)"
                  >
                    {{ privacyLabel(selectedDefinition.privacy) }}
                  </span>
                  <span class="text-[11px] text-zinc-400">{{ selectedDefinition.protocol }}</span>
                </div>
                <p v-if="selectedDefinition.description" class="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                  {{ selectedDefinition.description }}
                </p>
              </div>
              <UButton
                icon="i-lucide-repeat"
                size="xs"
                variant="ghost"
                :label="t('indexers.formChangeDefinition')"
                @click="step = 1"
              />
            </div>
          </div>

          <UAlert v-if="formError" color="error" :title="t('indexers.saveFailed')" :description="formError" />

          <UAlert v-if="formFailures.length > 0" color="error" :title="t('indexers.formValidationTitle')">
            <template #description>
              <ul class="list-disc pl-4 space-y-1">
                <li v-for="(failure, index) in formFailures" :key="index">{{ failure.errorMessage }}</li>
              </ul>
            </template>
          </UAlert>

          <UAlert
            v-if="formTestResult !== null"
            :color="formTestResult.isValid ? 'success' : 'error'"
            :title="formTestResult.isValid ? t('indexers.testValid') : t('indexers.testInvalid')"
          >
            <template v-if="!formTestResult.isValid" #description>
              <ul class="list-disc pl-4 space-y-1">
                <li v-for="(failure, index) in formTestResult.validationFailures" :key="index">
                  {{ failure.errorMessage }}
                </li>
              </ul>
            </template>
          </UAlert>

          <div class="rounded-lg border border-zinc-200 dark:border-white/10 p-4 space-y-4">
            <h3 class="text-sm font-semibold text-zinc-900 dark:text-white">{{ t('indexers.formBasicSection') }}</h3>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <UFormField :label="t('indexers.formName')" :help="t('indexers.formNameHelp')">
                <UInput v-model="form.name" :placeholder="t('indexers.formNamePlaceholder')" class="w-full" />
              </UFormField>
              <UFormField :label="t('indexers.formPriority')" :help="t('indexers.formPriorityHelp')">
                <UInput
                  :model-value="form.priority"
                  type="number"
                  min="1"
                  max="50"
                  class="w-full"
                  @update:model-value="onPriorityInput"
                />
              </UFormField>
              <UFormField :label="t('indexers.formAppProfile')">
                <USelect
                  :model-value="form.appProfileId"
                  :items="appProfileItems"
                  class="w-full"
                  @update:model-value="onAppProfileInput"
                />
              </UFormField>
              <UFormField :label="t('indexers.formTags')">
                <USelectMenu
                  v-model="form.tags"
                  :items="tagItems"
                  value-key="value"
                  multiple
                  :placeholder="t('indexers.formTagsPlaceholder')"
                  class="w-full"
                />
              </UFormField>
              <div class="flex items-center gap-2 sm:col-span-2">
                <USwitch v-model="form.enable" />
                <div>
                  <p class="text-sm font-medium text-zinc-700 dark:text-zinc-300">{{ t('indexers.formEnabled') }}</p>
                  <p class="text-xs text-zinc-500 dark:text-zinc-400">{{ t('indexers.formEnabledHelp') }}</p>
                </div>
              </div>
            </div>
          </div>

          <div v-if="fieldGroups.normal.length > 0" class="rounded-lg border border-zinc-200 dark:border-white/10 p-4">
            <h3 class="text-sm font-semibold text-zinc-900 dark:text-white mb-4">
              {{ t('indexers.formSettingsSection') }}
            </h3>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div
                v-for="field in fieldGroups.normal"
                :key="field.name"
                :class="field.type === 'info' || field.type === 'cardigannCaptcha' ? 'sm:col-span-2' : ''"
              >
                <AdminIndexersIndexerFieldControl
                  :field="field"
                  :model-value="form.fields[field.name] ?? null"
                  :captcha-image="captchaImage"
                  :captcha-loading="captchaLoading"
                  @update:model-value="(value) => (form.fields[field.name] = value)"
                  @request-captcha="requestCaptcha"
                />
              </div>
            </div>
          </div>

          <details
            v-if="fieldGroups.advanced.length > 0"
            class="rounded-lg border border-zinc-200 dark:border-white/10"
          >
            <summary class="cursor-pointer px-4 py-3 text-sm font-medium text-zinc-700 dark:text-zinc-300">
              {{ t('indexers.formAdvanced', { count: fieldGroups.advanced.length }) }}
            </summary>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 px-4 pb-4">
              <div
                v-for="field in fieldGroups.advanced"
                :key="field.name"
                :class="field.type === 'info' || field.type === 'cardigannCaptcha' ? 'sm:col-span-2' : ''"
              >
                <AdminIndexersIndexerFieldControl
                  :field="field"
                  :model-value="form.fields[field.name] ?? null"
                  :captcha-image="captchaImage"
                  :captcha-loading="captchaLoading"
                  @update:model-value="(value) => (form.fields[field.name] = value)"
                  @request-captcha="requestCaptcha"
                />
              </div>
            </div>
          </details>

          <div v-if="trackerVisible" class="rounded-lg border border-zinc-200 dark:border-white/10 p-4 space-y-4">
            <div class="flex items-start justify-between gap-4">
              <div>
                <h3 class="text-sm font-semibold text-zinc-900 dark:text-white">
                  {{ t('indexers.trackerSectionTitle') }}
                </h3>
                <p class="text-xs text-zinc-500 dark:text-zinc-400">{{ t('indexers.trackerSectionDesc') }}</p>
              </div>
              <USwitch v-model="trackerForm.enabled" />
            </div>

            <div
              v-if="currentTracker !== null"
              class="flex flex-wrap items-center gap-2 text-xs text-cyan-600 dark:text-cyan-400"
            >
              <UIcon name="i-lucide-link" class="w-3.5 h-3.5" />
              <span>{{ t('indexers.trackerExists') }}</span>
              <NuxtLink
                :to="`/admin/trackers?indexer=${encodeURIComponent(currentTracker.indexerName)}`"
                class="underline"
              >
                {{ t('indexers.trackerManageLink') }}
              </NuxtLink>
            </div>

            <div v-if="trackerForm.enabled" class="space-y-4">
              <div>
                <p class="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">{{ t('trackers.typeLabel') }}</p>
                <div class="flex gap-2">
                  <UButton
                    :label="t('trackers.typeCounting')"
                    :variant="trackerForm.trackerType === 'counting' ? 'solid' : 'outline'"
                    size="xs"
                    @click="void (trackerForm.trackerType = 'counting')"
                  />
                  <UButton
                    :label="t('trackers.typeGuid')"
                    :variant="trackerForm.trackerType === 'guid' ? 'solid' : 'outline'"
                    size="xs"
                    @click="void (trackerForm.trackerType = 'guid')"
                  />
                </div>
              </div>

              <div v-if="trackerForm.trackerType === 'guid'">
                <p class="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">{{ t('trackers.authMethod') }}</p>
                <div class="flex gap-2">
                  <UButton
                    :label="t('trackers.methodCookie')"
                    :variant="trackerForm.authMethod === 'cookie' ? 'solid' : 'outline'"
                    size="xs"
                    @click="void (trackerForm.authMethod = 'cookie')"
                  />
                  <UButton
                    :label="t('trackers.methodLogin')"
                    :variant="trackerForm.authMethod === 'login' ? 'solid' : 'outline'"
                    size="xs"
                    @click="void (trackerForm.authMethod = 'login')"
                  />
                </div>

                <div v-if="trackerForm.authMethod === 'cookie'" class="mt-3">
                  <UFormField :label="t('trackers.cookieLabel')" :description="t('trackers.cookieDesc')">
                    <UTextarea
                      v-model="trackerForm.cookie"
                      :placeholder="t('trackers.cookiePlaceholder')"
                      :rows="3"
                      class="w-full"
                    />
                  </UFormField>
                </div>

                <div v-else class="space-y-3 mt-3">
                  <UFormField :label="t('trackers.loginUrlLabel')" :description="t('trackers.loginUrlDesc')">
                    <UInput
                      v-model="trackerForm.loginUrl"
                      :placeholder="t('trackers.loginUrlPlaceholder')"
                      class="w-full"
                    />
                  </UFormField>
                  <UFormField :label="t('trackers.loginUsernameLabel')">
                    <UInput
                      v-model="trackerForm.loginUsername"
                      :placeholder="t('trackers.loginUsernamePlaceholder')"
                      class="w-full"
                    />
                  </UFormField>
                  <UFormField
                    :label="t('trackers.loginPasswordLabel')"
                    :description="trackerForm.hasStoredPassword ? t('trackers.loginPasswordEdit') : ''"
                  >
                    <UInput
                      v-model="trackerForm.loginPassword"
                      type="password"
                      :placeholder="t('trackers.loginPasswordPlaceholder')"
                      class="w-full"
                    />
                  </UFormField>
                </div>
              </div>
            </div>
          </div>
        </div>
      </template>

      <template #footer>
        <div class="flex w-full items-center justify-between gap-2">
          <div>
            <UButton
              v-if="modalMode === 'create' && step === 2"
              icon="i-lucide-arrow-left"
              variant="ghost"
              :label="t('indexers.formBackToDefinitions')"
              @click="step = 1"
            />
          </div>
          <div class="flex items-center gap-2">
            <UButton :label="t('common.cancel')" variant="ghost" @click="void (modalOpen = false)" />
            <template v-if="modalMode === 'edit' || step === 2">
              <UButton
                icon="i-lucide-flask-conical"
                variant="outline"
                :label="t('indexers.formTest')"
                :loading="testingForm"
                :disabled="saving"
                @click="testForm"
              />
              <UButton
                icon="i-lucide-save"
                :label="modalMode === 'edit' ? t('common.saveChanges') : t('common.create')"
                :loading="saving"
                :disabled="!canSubmitForm"
                @click="save"
              />
            </template>
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>
