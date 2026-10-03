<template>
  <!-- Trigger part: the Filters button (glass, placement is decided by the
       parent, e.g. ml-auto in the section header row) -->
  <div v-if="hasOptions && props.part === 'trigger'" class="flex items-center gap-2">
    <!-- Closed by default: one quiet trigger. Open: grouped options with counts,
         and the panel stays open while multi-selecting (unlike a dropdown menu) -->
    <UPopover
      v-model:open="open"
      :ui="{ content: 'w-80 max-w-[calc(100vw-2rem)]' }"
      :content="{ sideOffset: 8, align: 'end' }"
    >
      <UButton
        :variant="active ? 'soft' : 'ghost'"
        :color="active ? 'primary' : 'neutral'"
        size="md"
        icon="i-lucide-sliders-horizontal"
        trailing-icon="i-lucide-chevron-down"
        :ui="{ trailingIcon: open ? 'rotate-180 transition-transform' : 'transition-transform' }"
        :label="active ? `${t('browse.filters.title')} (${activeCount})` : t('browse.filters.title')"
        :class="
          active
            ? 'cursor-pointer border border-primary/30 shadow-sm backdrop-blur-md'
            : 'cursor-pointer border border-zinc-200/70 bg-white/60 shadow-sm backdrop-blur-md hover:bg-white/80 dark:border-zinc-700/60 dark:bg-zinc-800/60 dark:hover:bg-zinc-800/80'
        "
      />
      <template #content>
        <div class="max-h-[24rem] overflow-y-auto p-4">
          <div class="mb-3 flex items-center justify-between gap-2">
            <p class="text-sm font-semibold text-zinc-900 dark:text-white">{{ t('browse.filters.title') }}</p>
            <UButton
              v-if="active"
              color="neutral"
              variant="ghost"
              size="xs"
              class="cursor-pointer"
              :label="t('browse.filters.reset')"
              @click="reset"
            />
          </div>
          <div class="space-y-5">
            <section
              v-for="(row, index) in groupRows"
              :key="row.group"
              :class="index > 0 ? 'border-t border-zinc-200 pt-4 dark:border-zinc-700/70' : ''"
            >
              <p class="mb-1.5 px-2 text-xs font-semibold text-zinc-500 dark:text-zinc-400">
                {{ t(`browse.filters.groups.${row.group}`) }}
              </p>
              <UCheckboxGroup
                :model-value="props.modelValue[row.group]"
                :items="row.items"
                orientation="vertical"
                variant="list"
                size="sm"
                :ui="{
                  fieldset: 'gap-y-1',
                  base: 'rounded-md',
                  item: 'w-full cursor-pointer rounded-lg px-2 py-2 transition-colors hover:bg-zinc-500/10 has-data-[state=checked]:bg-primary/10'
                }"
                @update:model-value="(v) => setGroup(row.group, v)"
              />
            </section>
            <div v-if="captureCount > 0" class="border-t border-zinc-200 px-2 pt-4 dark:border-zinc-700/70">
              <USwitch
                :model-value="props.modelValue.hideCapture"
                size="sm"
                class="cursor-pointer"
                :label="t('browse.filters.hideCapture')"
                @update:model-value="(v) => setHideCapture(v === true)"
              />
            </div>
          </div>
        </div>
      </template>
    </UPopover>
  </div>

  <!-- Status part: full-width strip under the header, everything left-aligned.
       The plain wrapper (not the Transition) owns the layout, so the bottom
       spacing below the strip never depends on transition fallthrough -->
  <div v-if="hasOptions && props.part === 'status'">
    <Transition name="filter-strip">
      <!-- Same surface as a TorrentRow row, plus a whisper of blur so text stays
           readable over the page backdrop -->
      <div
        v-if="active"
        class="mb-4 flex flex-wrap items-center gap-2 rounded-lg bg-zinc-100/50 px-4 py-3 backdrop-blur-sm dark:bg-zinc-700/30"
      >
        <TransitionGroup name="filter-chip">
          <UButton
            v-for="chip in activeChips"
            :key="chip.key"
            color="neutral"
            variant="outline"
            size="xs"
            :label="chip.label"
            trailing-icon="i-lucide-x"
            class="cursor-pointer bg-white/60 font-medium dark:bg-zinc-900/40"
            :aria-label="t('browse.filters.remove', { tag: chip.label })"
            @click="chip.remove"
          />
        </TransitionGroup>
        <span class="text-xs tabular-nums text-zinc-500 dark:text-zinc-400">
          {{ t('browse.filters.showing', { shown: visibleCount, total: props.items.length }) }}
        </span>
        <UButton
          color="neutral"
          variant="ghost"
          size="xs"
          class="cursor-pointer"
          :label="t('browse.filters.reset')"
          @click="reset"
        />
      </div>
    </Transition>
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
  // The trigger (Filters button) lives in the section header row while the
  // status strip spans full width below it, so the two render separately
  part: 'trigger' | 'status'
}>()

const emit = defineEmits<{
  'update:modelValue': [value: TorrentFiltersState]
}>()

const { t } = useI18n()

const open = ref(false)

const GROUP_ORDER: TorrentFilterGroup[] = ['source', 'resolution', 'video', 'audio']

// Only options that occur in the current results are offered; counts are
// over the full loaded list (see collectFilterOptions)
const options = computed(() => collectFilterOptions(props.items))

const groupRows = computed(() =>
  GROUP_ORDER.map((group) => ({
    group,
    items: options.value.filter((o) => o.group === group).map((o) => ({ label: `${o.tag} (${o.count})`, value: o.tag }))
  })).filter((row) => row.items.length > 0)
)

const captureCount = computed(() =>
  options.value.filter((o) => o.group === 'source' && CAPTURE_TAGS.includes(o.tag)).reduce((sum, o) => sum + o.count, 0)
)

const hasOptions = computed(() => groupRows.value.length > 0 || captureCount.value > 0)

const visibleCount = computed(() => props.items.filter((item) => matchesFilters(item, props.modelValue)).length)

const active = computed(() => hasActiveFilters(props.modelValue))

const activeCount = computed(
  () =>
    props.modelValue.source.length +
    props.modelValue.resolution.length +
    props.modelValue.video.length +
    props.modelValue.audio.length +
    (props.modelValue.hideCapture ? 1 : 0)
)

interface ActiveChip {
  key: string
  label: string
  remove: () => void
}

const activeChips = computed<ActiveChip[]>(() => {
  const chips: ActiveChip[] = []
  for (const group of GROUP_ORDER) {
    for (const tag of props.modelValue[group]) {
      chips.push({
        key: `${group}-${tag}`,
        label: tag,
        remove: () =>
          setGroup(
            group,
            props.modelValue[group].filter((v) => v !== tag)
          )
      })
    }
  }
  if (props.modelValue.hideCapture === true) {
    chips.push({
      key: 'capture',
      label: t('browse.filters.hideCapture'),
      remove: () => setHideCapture(false)
    })
  }
  return chips
})

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
