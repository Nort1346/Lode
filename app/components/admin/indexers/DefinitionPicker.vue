<script setup lang="ts">
import type { IndexerDefinitionSummary, IndexerSchemaPage } from '#shared/indexers'

const emit = defineEmits<{
  select: [definition: IndexerDefinitionSummary]
}>()

const { t } = useI18n()

const search = ref('')
const privacy = ref('all')
const protocol = ref('all')
const page = ref(1)
const loading = ref(true)
const error = ref('')
const data = ref<IndexerSchemaPage>({ items: [], total: 0, page: 1, limit: 24, totalPages: 0 })

const privacyItems = computed(() => [
  { label: t('indexers.filterAllPrivacy'), value: 'all' },
  { label: t('indexers.privacyPublic'), value: 'public' },
  { label: t('indexers.privacySemiPrivate'), value: 'semiPrivate' },
  { label: t('indexers.privacyPrivate'), value: 'private' }
])

const protocolItems = computed(() => [
  { label: t('indexers.protocolAll'), value: 'all' },
  { label: t('indexers.protocolTorrent'), value: 'torrent' },
  { label: t('indexers.protocolUsenet'), value: 'usenet' }
])

let searchTimer: ReturnType<typeof setTimeout> | undefined

async function fetchSchema() {
  loading.value = true
  error.value = ''
  try {
    const query = new URLSearchParams({
      page: String(page.value),
      limit: '24'
    })
    if (search.value.trim().length > 0) query.set('q', search.value.trim())
    if (privacy.value !== 'all') query.set('privacy', privacy.value)
    if (protocol.value !== 'all') query.set('protocol', protocol.value)

    data.value = await $fetch<IndexerSchemaPage>(`/api/admin/indexers/schema?${query.toString()}`)
  } catch (e: unknown) {
    error.value = describeApiError(e, t).description
  } finally {
    loading.value = false
  }
}

watch(search, () => {
  if (searchTimer !== undefined) clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    page.value = 1
    void fetchSchema()
  }, 250)
})

watch([privacy, protocol], () => {
  page.value = 1
  void fetchSchema()
})

onMounted(fetchSchema)

onUnmounted(() => {
  if (searchTimer !== undefined) clearTimeout(searchTimer)
})

function goToPage(target: number) {
  if (target < 1 || target > data.value.totalPages || target === page.value) return
  page.value = target
  void fetchSchema()
}

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
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-col sm:flex-row gap-2">
      <UInput
        v-model="search"
        icon="i-lucide-search"
        :placeholder="t('indexers.definitionSearchPlaceholder')"
        class="flex-1"
      />
      <USelect v-model="privacy" :items="privacyItems" class="sm:w-44" />
      <USelect v-model="protocol" :items="protocolItems" class="sm:w-40" />
    </div>

    <UAlert v-if="error" color="error" :description="error" />

    <div v-if="loading" class="space-y-2">
      <div v-for="i in 6" :key="i" class="rounded-lg border border-zinc-200 dark:border-white/10 p-3">
        <USkeleton class="h-4 w-48 mb-2" />
        <USkeleton class="h-3 w-full" />
      </div>
    </div>

    <div v-else-if="data.items.length === 0" class="py-10 text-center text-sm text-zinc-500 dark:text-zinc-400">
      {{ t('indexers.definitionEmpty') }}
    </div>

    <div v-else class="max-h-[52vh] overflow-y-auto pr-1 space-y-2">
      <button
        v-for="definition in data.items"
        :key="definition.definitionName"
        type="button"
        class="w-full text-left rounded-lg border border-zinc-200 dark:border-white/10 p-3 transition-colors hover:border-primary-400 dark:hover:border-primary-500 hover:bg-zinc-50 dark:hover:bg-white/5"
        @click="emit('select', definition)"
      >
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <div class="flex flex-wrap items-center gap-2">
              <span class="text-sm font-semibold text-zinc-900 dark:text-white">{{ definition.name }}</span>
              <span class="px-2 py-0.5 rounded-full text-[11px] font-medium" :class="privacyClass(definition.privacy)">
                {{ privacyLabel(definition.privacy) }}
              </span>
              <span
                class="px-2 py-0.5 rounded-full text-[11px] font-medium bg-zinc-500/15 text-zinc-600 dark:text-zinc-300"
              >
                {{ definition.protocol }}
              </span>
              <span v-if="definition.language" class="text-[11px] text-zinc-400">{{ definition.language }}</span>
            </div>
            <p v-if="definition.description" class="mt-1 text-xs text-zinc-500 dark:text-zinc-400 line-clamp-2">
              {{ definition.description }}
            </p>
          </div>
          <UIcon name="i-lucide-chevron-right" class="w-4 h-4 shrink-0 text-zinc-400 mt-1" />
        </div>
      </button>
    </div>

    <div v-if="!loading && data.totalPages > 1" class="flex items-center justify-between gap-2 text-sm">
      <span class="text-zinc-500 dark:text-zinc-400">{{
        t('indexers.definitionPage', { page, total: data.totalPages })
      }}</span>
      <div class="flex gap-2">
        <UButton
          icon="i-lucide-chevron-left"
          size="xs"
          variant="outline"
          :disabled="page <= 1"
          @click="goToPage(page - 1)"
        />
        <UButton
          icon="i-lucide-chevron-right"
          size="xs"
          variant="outline"
          :disabled="page >= data.totalPages"
          @click="goToPage(page + 1)"
        />
      </div>
    </div>
  </div>
</template>
