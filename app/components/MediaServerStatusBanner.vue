<script setup lang="ts">
import type { ServiceStatus } from '~/types/settings'

const props = defineProps<{
  status: ServiceStatus | null
}>()

const { t } = useI18n()

const broken = computed(() => {
  const s = props.status?.status
  return s === 'invalid' || s === 'down' || s === 'error'
})

const color = computed<'warning' | 'error'>(() => (props.status?.status === 'error' ? 'error' : 'warning'))

const title = computed(() => {
  const s = props.status?.status
  if (s === 'invalid') return t('settings.serviceInvalid')
  if (s === 'down') return t('settings.serviceDown')
  return t('settings.serviceError')
})

const description = computed(() => {
  const s = props.status?.status
  if (s === 'invalid') return t('settings.hintInvalid')
  if (s === 'down') return t('settings.hintOffline')
  return props.status?.details ?? t('settings.hintError')
})
</script>

<template>
  <UAlert
    v-if="broken"
    :color="color"
    variant="subtle"
    icon="i-lucide-triangle-alert"
    :title="title"
    :description="description"
    class="mb-4"
  />
</template>
