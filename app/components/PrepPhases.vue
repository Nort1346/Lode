<script setup lang="ts">
import type { Download } from '~/types/downloads'
import { computeImportPercent, computeWaitPercent } from '~/utils/prep-progress'

const { t } = useI18n()

const props = defineProps<{
  download: Download
  delaySeconds: number
  countdownEnabled: boolean
}>()

const phases = computed(() => [
  {
    key: 'download',
    label: t('downloads.prepPhaseDownload'),
    icon: 'i-lucide-download',
    tone: 'text-blue-600 dark:text-blue-400',
    bar: 'bg-blue-500',
    percent: 100
  },
  {
    key: 'organize',
    label: t('downloads.prepPhaseOrganize'),
    icon: 'i-lucide-package-open',
    tone: 'text-amber-600 dark:text-amber-400',
    bar: 'bg-amber-500',
    percent: computeImportPercent(props.download)
  },
  {
    key: 'wait',
    label: t('downloads.prepPhaseWait'),
    icon: 'i-lucide-hourglass',
    tone: 'text-sky-600 dark:text-sky-400',
    bar: 'bg-sky-500',
    percent: computeWaitPercent(props.download, props.delaySeconds, props.countdownEnabled)
  }
])
</script>

<template>
  <div class="space-y-2">
    <div v-for="phase in phases" :key="phase.key" class="space-y-1">
      <div class="flex items-center justify-between text-xs">
        <span class="flex items-center gap-1.5 font-medium text-zinc-600 dark:text-zinc-300">
          <UIcon :name="phase.icon" class="size-3.5" :class="phase.percent >= 100 ? 'text-green-500' : phase.tone" />
          {{ phase.label }}
        </span>
        <span class="font-medium" :class="phase.percent >= 100 ? 'text-green-600 dark:text-green-400' : phase.tone">
          {{ phase.percent.toFixed(1) }}%
        </span>
      </div>
      <div
        role="progressbar"
        :aria-valuenow="phase.percent"
        aria-valuemin="0"
        aria-valuemax="100"
        :aria-label="phase.label"
        class="w-full h-2 rounded-full bg-zinc-200 dark:bg-white/10"
      >
        <div
          class="h-full min-w-0.5 rounded-full transition-[width] duration-1000 ease-linear"
          :class="phase.percent >= 100 ? 'bg-green-500' : phase.bar"
          :style="{ width: `${Math.max(phase.percent, 0.5)}%` }"
        />
      </div>
    </div>
  </div>
</template>
