<script setup lang="ts">
import type { DiskStatus } from '~/types/settings'

const { t } = useI18n()
const toast = useToast()

const diskStatuses = ref<DiskStatus[]>([])
const loading = ref(true)
const diskMinFreeGb = ref(7)
const diskCheckEnabled = ref(true)

async function fetchDisks() {
  loading.value = true
  try {
    const data = await $fetch<{ disks: DiskStatus[]; minFreeSpaceGb: number; checkEnabled: boolean }>(
      '/api/admin/disk-status'
    )
    diskStatuses.value = data.disks
    diskMinFreeGb.value = data.minFreeSpaceGb
    diskCheckEnabled.value = data.checkEnabled
  } catch {
    diskStatuses.value = []
  } finally {
    loading.value = false
  }
}

async function toggleDiskCheck() {
  const newValue = !diskCheckEnabled.value
  await $fetch('/api/admin/disk-status', { method: 'PUT', body: { checkEnabled: newValue } })
  diskCheckEnabled.value = newValue
  toast.add({ title: t('settings.diskCheckSaved'), color: 'success' })
}

async function changeMinFreeGb(event: Event) {
  const input = event.target as HTMLInputElement
  const val = Number(input.value)
  if (Number.isNaN(val) || val < 0) return
  diskMinFreeGb.value = val
  await $fetch('/api/admin/disk-status', { method: 'PUT', body: { minFreeSpaceGb: val } })
  const data = await $fetch<{ disks: DiskStatus[]; minFreeSpaceGb: number; checkEnabled: boolean }>(
    '/api/admin/disk-status'
  )
  diskStatuses.value = data.disks
  toast.add({ title: t('settings.diskMinFreeSaved'), color: 'success' })
}

onMounted(fetchDisks)
</script>

<template>
  <div class="card p-6 mb-4">
    <h2 class="text-lg font-semibold text-zinc-900 dark:text-white mb-4">{{ t('settings.diskStatus') }}</h2>
    <p class="text-sm text-zinc-500 dark:text-zinc-400 mb-4">{{ t('settings.diskStatusDesc') }}</p>
    <div v-if="loading" class="space-y-3">
      <USkeleton v-for="i in 2" :key="i" class="h-20 w-full rounded-xl" />
    </div>
    <div v-else-if="diskStatuses.length === 0" class="text-sm text-zinc-500 dark:text-zinc-400">
      {{ t('settings.notConfigured') }} - NUXT_DISKS
    </div>
    <div v-else class="space-y-4">
      <div class="flex items-center justify-between mb-3">
        <div class="flex items-center gap-2">
          <UIcon
            :name="diskCheckEnabled ? 'i-lucide-check-circle' : 'i-lucide-x-circle'"
            class="size-4"
            :class="diskCheckEnabled ? 'text-green-500' : 'text-zinc-400'"
          />
          <label class="text-sm font-medium text-zinc-700 dark:text-zinc-300">{{
            t('settings.diskCheckEnabled')
          }}</label>
        </div>
        <USwitch :model-value="diskCheckEnabled" @update:model-value="toggleDiskCheck" />
      </div>
      <div class="flex items-center gap-3 mb-3">
        <label class="text-sm font-medium text-zinc-700 dark:text-zinc-300 shrink-0">{{
          t('settings.diskMinRequired')
        }}</label>
        <UInput :model-value="diskMinFreeGb" type="number" :min="0" class="w-24" @change="changeMinFreeGb" />
        <span class="text-sm text-zinc-500 dark:text-zinc-400">GB</span>
      </div>
      <div v-for="disk in diskStatuses" :key="disk.path" class="space-y-2">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <span class="text-sm font-medium text-zinc-900 dark:text-white">{{ disk.path }}</span>
            <span
              v-if="!disk.available"
              class="rounded-full bg-red-500/10 px-2 py-0.5 text-xs font-medium text-red-600 dark:text-red-400"
            >
              {{ t('settings.diskUnavailable') }}
            </span>
            <span
              v-else-if="!disk.hasEnoughSpace"
              class="rounded-full bg-red-500/10 px-2 py-0.5 text-xs font-medium text-red-600 dark:text-red-400"
            >
              {{ t('settings.diskLow') }}
            </span>
            <span
              v-else
              class="rounded-full bg-green-500/10 px-2 py-0.5 text-xs font-medium text-green-600 dark:text-green-400"
            >
              {{ t('settings.diskOk') }}
            </span>
          </div>
          <span class="text-xs text-zinc-500 dark:text-zinc-400">
            {{ t('settings.diskFree') }}: {{ disk.freeFormatted }} / {{ t('settings.diskTotal') }}:
            {{ disk.totalFormatted }}
          </span>
        </div>
        <UProgress
          :model-value="disk.usedPercent"
          :color="!disk.available ? 'neutral' : disk.hasEnoughSpace ? 'primary' : 'error'"
          size="sm"
        />
      </div>
    </div>
  </div>
</template>
