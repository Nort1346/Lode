<script setup lang="ts">
import type { WatchLinksPayload, WatchPlatform, WatchTarget, WatchTargetId } from '#shared/watch'
import { detectWatchPlatform, rankWatchTargets } from '#shared/watch'

const props = defineProps<{
  tmdbId: number
  inLibrary: boolean
}>()

const { t } = useI18n()
const toast = useToast()
const { launch } = useWatchLauncher()

const payload = ref<WatchLinksPayload | null>(null)
const platform = ref<WatchPlatform>('other')
const loading = ref(false)
const launching = ref(false)

const orderedTargets = computed(() => (payload.value ? rankWatchTargets(payload.value.targets, platform.value) : []))

async function loadLinks(): Promise<void> {
  loading.value = true
  try {
    payload.value = await $fetch<WatchLinksPayload>('/api/watch/links', {
      query: { tmdbId: props.tmdbId }
    })
  } catch {
    payload.value = { available: false, targets: [] }
  } finally {
    loading.value = false
  }
}

function labelFor(target: WatchTarget): string {
  const labels: Record<WatchTargetId, string> = {
    moonfin: t('watch.moonfin'),
    swiftfin: t('watch.swiftfin'),
    findroid: t('watch.findroid'),
    'jellyfin-web': t('watch.jellyfinWeb'),
    plex: t('watch.plex'),
    'plex-web': t('watch.plexWeb'),
    emby: t('watch.emby'),
    'emby-web': t('watch.embyWeb')
  }
  return labels[target.id]
}

function iconFor(target: WatchTarget): string {
  return target.kind === 'web' ? 'i-lucide-globe' : 'i-lucide-app-window'
}

async function open(target?: WatchTarget): Promise<void> {
  if (launching.value || orderedTargets.value.length === 0) return
  launching.value = true
  try {
    const opened = await launch(orderedTargets.value, platform.value, target)
    if (!opened && !target && orderedTargets.value.some((item) => item.kind === 'web')) {
      toast.add({ title: t('watch.openInBrowser'), color: 'info' })
    }
  } finally {
    launching.value = false
  }
}

const dropdownItems = computed(() =>
  orderedTargets.value.map((target) => ({
    label: t('watch.openIn', { app: labelFor(target) }),
    icon: iconFor(target),
    onSelect: () => {
      void open(target)
    }
  }))
)

onMounted(() => {
  platform.value = detectWatchPlatform(
    navigator.userAgent,
    navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1
  )
  if (props.inLibrary) {
    void loadLinks()
  }
})

watch(
  () => props.tmdbId,
  () => {
    if (import.meta.client && props.inLibrary) {
      void loadLinks()
    }
  }
)
</script>

<template>
  <div v-if="inLibrary && (loading || orderedTargets.length > 0)" class="inline-flex items-center">
    <UButton
      color="primary"
      icon="i-lucide-play"
      class="rounded-r-none"
      :loading="loading || launching"
      :disabled="launching"
      data-testid="watch-button"
      @click="open()"
    >
      {{ t('watch.watch') }}
    </UButton>
    <UDropdownMenu :items="dropdownItems">
      <UButton
        color="primary"
        icon="i-lucide-chevron-down"
        class="rounded-l-none border-l border-white/20"
        :aria-label="t('watch.choosePlayer')"
        :disabled="launching"
        data-testid="watch-options"
      />
    </UDropdownMenu>
  </div>
</template>
