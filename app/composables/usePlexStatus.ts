import { ref } from 'vue'
import type { ServiceStatus } from '~/types/settings'

export function usePlexStatus() {
  const status = ref<ServiceStatus | null>(null)
  const loading = ref(false)

  async function refresh(): Promise<void> {
    loading.value = true
    try {
      status.value = await $fetch<ServiceStatus>('/api/admin/plex/status')
    } catch {
      status.value = null
    } finally {
      loading.value = false
    }
  }

  return { status, loading, refresh }
}
