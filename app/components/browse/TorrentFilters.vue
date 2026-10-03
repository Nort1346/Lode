<template>
  <div
    v-if="groupRows.length > 0 || captureCount > 0"
    class="space-y-3 rounded-xl border border-zinc-200 bg-white/50 p-4 dark:border-zinc-700 dark:bg-zinc-800/50"
  >
    <div v-for="row in groupRows" :key="row.group" class="flex flex-col gap-2 sm:flex-row sm:items-start sm:gap-4">
      <span class="w-28 shrink-0 pt-1 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        {{ t(`browse.filters.groups.${row.group}`) }}
      </span>
      <UCheckboxGroup
        :model-value="props.modelValue[row.group]"
        :items="row.items"
        orientation="horizontal"
        variant="list"
        size="xs"
        @update:model-value="(v) => setGroup(row.group, v)"
      />
    </div>

    <div v-if="captureCount > 0" class="sm:ps-32">
      <USwitch
        :model-value="props.modelValue.hideCapture"
        size="sm"
        :label="t('browse.filters.hideCapture')"
        @update:model-value="(v) => setHideCapture(v === true)"
      />
    </div>

    <div v-if="hasActiveFilters(props.modelValue)" class="flex flex-wrap items-center gap-3 border-t border-zinc-200 pt-3 dark:border-zinc-700">
      <UButton
        color="neutral"
        variant="ghost"
        size="xs"
        icon="i-lucide-rotate-ccw"
        :label="t('browse.filters.reset')"
        @click="reset"
      />
      <span class="text-xs text-zinc-500 dark:text-zinc-400">
        {{ t('browse.filters.showing', { shown: visibleCount, total: props.items.length }) }}
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
import {
  collectFilterOptions,
  hasActiveFilters,
  matchesFilters,
  emptyFilters,
  CAPTURE_TAGS
} from '#shared/torrent-filters'
import type { TorrentFilterGroup, TorrentFilterItem, TorrentFiltersState } from '#shared/torrent-filters'

const props = defineProps<{
  items: TorrentFilterItem[]
  modelValue: TorrentFiltersState
}>()

const emit = defineEmits<{
  'update:modelValue': [value: TorrentFiltersState]
}>()

const { t } = useI18n()

const GROUP_ORDER: TorrentFilterGroup[] = ['source', 'resolution', 'video', 'audio']

// Only options that occur in the current results are offered; counts are
// over the full loaded list (see collectFilterOptions)
const options = computed(() => collectFilterOptions(props.items))

const groupRows = computed(() =>
  GROUP_ORDER.map((group) => ({
    group,
    items: options.value
      .filter((o) => o.group === group)
      .map((o) => ({ label: `${o.tag} (${o.count})`, value: o.tag }))
  })).filter((row) => row.items.length > 0)
)

const captureCount = computed(
  () => options.value.filter((o) => o.group === 'source' && CAPTURE_TAGS.includes(o.tag)).reduce((sum, o) => sum + o.count, 0)
)

const visibleCount = computed(() => props.items.filter((item) => matchesFilters(item, props.modelValue)).length)

function setGroup(group: TorrentFilterGroup, value: string | string[]) {
  emit('update:modelValue', {
    ...props.modelValue,
    [group]: Array.isArray(value) ? value : value === undefined ? [] : [value]
  })
}

function setHideCapture(value: boolean) {
  emit('update:modelValue', { ...props.modelValue, hideCapture: value })
}

function reset() {
  emit('update:modelValue', emptyFilters())
}
</script>
