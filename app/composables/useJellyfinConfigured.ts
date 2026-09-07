import { getCurrentInstance, onMounted, ref } from 'vue'
import type { SyncProvidersResponse } from '~/types/sync'

export function useJellyfinConfigured() {
  const configured = ref(false)
  const loading = ref(false)

  async function refresh(): Promise<void> {
    loading.value = true
    try {
      const data = await $fetch<SyncProvidersResponse>('/api/admin/sync/providers')
      configured.value = data?.jellyfinConfigured === true
    } catch {
      configured.value = false
    } finally {
      loading.value = false
    }
  }

  if (getCurrentInstance()) {
    onMounted(refresh)
  }

  return { configured, loading, refresh }
}
