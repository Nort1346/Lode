<script setup lang="ts">
import { useServiceHealth } from '~/composables/useServiceHealth'
import type { CoreServiceKey, ServiceIssueKind } from '~/composables/useServiceHealth'

// Dismissible outage banners for services that degrade (but do not block) the
// page: Prowlarr search and the qBittorrent download client. Rendered only
// after the first check resolves, so a pending check never shifts the layout.
const props = withDefaults(
  defineProps<{
    services?: CoreServiceKey[]
  }>(),
  {
    services: () => ['prowlarr', 'qbittorrent']
  }
)

const { t } = useI18n()
const { issues, dismissed, dismiss, checked } = useServiceHealth()

interface IssueRow {
  kind: ServiceIssueKind
  color: 'error' | 'warning'
  icon: string
  title: string
  description: string
}

function describe(kind: ServiceIssueKind): IssueRow {
  switch (kind) {
    case 'prowlarr-down':
      return {
        kind,
        color: 'error',
        icon: 'i-lucide-unplug',
        title: t('serviceHealth.prowlarr.downTitle'),
        description: t('serviceHealth.prowlarr.downDesc')
      }
    case 'prowlarr-invalid':
      return {
        kind,
        color: 'warning',
        icon: 'i-lucide-triangle-alert',
        title: t('serviceHealth.prowlarr.invalidTitle'),
        description: t('serviceHealth.prowlarr.invalidDesc')
      }
    case 'prowlarr-no-indexers':
      return {
        kind,
        color: 'warning',
        icon: 'i-lucide-wrench',
        title: t('serviceHealth.prowlarr.noIndexersTitle'),
        description: t('serviceHealth.prowlarr.noIndexersDesc')
      }
    case 'prowlarr-setup':
      return {
        kind,
        color: 'warning',
        icon: 'i-lucide-wrench',
        title: t('serviceHealth.prowlarr.setupTitle'),
        description: t('serviceHealth.prowlarr.setupDesc')
      }
    case 'qbittorrent-down':
      return {
        kind,
        color: 'error',
        icon: 'i-lucide-unplug',
        title: t('serviceHealth.qbit.downTitle'),
        description: t('serviceHealth.qbit.downDesc')
      }
    case 'qbittorrent-invalid':
      return {
        kind,
        color: 'warning',
        icon: 'i-lucide-triangle-alert',
        title: t('serviceHealth.qbit.invalidTitle'),
        description: t('serviceHealth.qbit.invalidDesc')
      }
    case 'qbittorrent-setup':
      return {
        kind,
        color: 'warning',
        icon: 'i-lucide-wrench',
        title: t('serviceHealth.qbit.setupTitle'),
        description: t('serviceHealth.qbit.setupDesc')
      }
  }
}

const rows = computed<IssueRow[]>(() => {
  if (!checked.value) return []
  return issues.value
    .filter((kind) => {
      const service = kind.split('-')[0] as CoreServiceKey
      return props.services.includes(service) && dismissed.value[kind] !== true
    })
    .map(describe)
})

function onClose(kind: ServiceIssueKind, open: boolean) {
  if (open === false) dismiss(kind)
}
</script>

<template>
  <Transition name="health-banner">
    <div v-if="rows.length > 0" v-reveal class="mb-4 space-y-2">
      <UAlert
        v-for="row in rows"
        :key="row.kind"
        :color="row.color"
        variant="subtle"
        :icon="row.icon"
        :title="row.title"
        :description="row.description"
        :close="true"
        @update:open="(open: boolean) => onClose(row.kind, open)"
      />
    </div>
  </Transition>
</template>

<style scoped>
.health-banner-enter-active {
  transition:
    opacity 150ms ease,
    transform 150ms ease;
}

.health-banner-leave-active {
  transition: opacity 100ms ease;
}

.health-banner-enter-from,
.health-banner-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

@media (prefers-reduced-motion: reduce) {
  .health-banner-enter-active,
  .health-banner-leave-active {
    transition: none;
  }
}
</style>
