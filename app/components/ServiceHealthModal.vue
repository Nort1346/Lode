<script setup lang="ts">
import { useServiceHealth } from '~/composables/useServiceHealth'

// Blocking service modal: no close button, no backdrop/escape dismiss. It is
// removed only when the parent re-evaluates the service state after a Retry.
const props = defineProps<{
  service: 'tmdb' | 'qbittorrent'
}>()

const { t } = useI18n()
const { tmdb, qbittorrent, retry, retrying } = useServiceHealth()

const status = computed(() => (props.service === 'tmdb' ? tmdb.value : qbittorrent.value))

type Tone = 'error' | 'warning'

interface Presentation {
  tone: Tone
  icon: string
  title: string
  description: string
}

// Three distinct severities: unreachable (error/red), rejected auth and
// missing setup (warning/amber, different icons), so a glance tells them apart.
const presentation = computed<Presentation>(() => {
  const st = status.value?.status
  if (props.service === 'tmdb') {
    if (st === 'invalid') {
      return {
        tone: 'warning',
        icon: 'i-lucide-triangle-alert',
        title: t('serviceHealth.tmdb.invalidTitle'),
        description: t('serviceHealth.tmdb.invalidDesc')
      }
    }
    return {
      tone: 'error',
      icon: 'i-lucide-unplug',
      title: t('serviceHealth.tmdb.downTitle'),
      description: t('serviceHealth.tmdb.downDesc')
    }
  }
  if (st === 'invalid') {
    return {
      tone: 'warning',
      icon: 'i-lucide-triangle-alert',
      title: t('serviceHealth.qbit.invalidTitle'),
      description: t('serviceHealth.qbit.invalidDesc')
    }
  }
  if (st === 'not_configured') {
    return {
      tone: 'warning',
      icon: 'i-lucide-wrench',
      title: t('serviceHealth.qbit.setupTitle'),
      description: t('serviceHealth.qbit.setupDesc')
    }
  }
  return {
    tone: 'error',
    icon: 'i-lucide-unplug',
    title: t('serviceHealth.qbit.downTitle'),
    description: t('serviceHealth.qbit.downDesc')
  }
})

const toneClasses: Record<Tone, { badge: string; icon: string }> = {
  error: {
    badge: 'bg-red-500/10 ring-red-500/20',
    icon: 'text-red-600 dark:text-red-400'
  },
  warning: {
    badge: 'bg-amber-500/10 ring-amber-500/20',
    icon: 'text-amber-600 dark:text-amber-400'
  }
}

function onRetry() {
  void retry()
}
</script>

<template>
  <UModal :open="true" :close="false" :dismissible="false">
    <template #header>
      <div v-reveal="'fade'" class="flex flex-col items-center text-center">
        <div
          class="mb-4 flex size-12 items-center justify-center rounded-2xl ring-1"
          :class="toneClasses[presentation.tone].badge"
        >
          <UIcon :name="presentation.icon" class="size-6" :class="toneClasses[presentation.tone].icon" />
        </div>
        <h3 class="font-semibold text-highlighted">{{ presentation.title }}</h3>
        <p class="mt-1 text-sm text-muted">{{ presentation.description }}</p>
      </div>
    </template>

    <template #body>
      <div class="pt-4">
        <UButton
          type="button"
          color="primary"
          variant="solid"
          size="lg"
          block
          icon="i-lucide-refresh-cw"
          :label="t('serviceHealth.retry')"
          :loading="retrying"
          @click="onRetry"
        />
      </div>
    </template>
  </UModal>
</template>
