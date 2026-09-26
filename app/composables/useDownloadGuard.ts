import { computed } from 'vue'
import { useServiceHealth } from './useServiceHealth'

// Guards the actions that need qBittorrent (starting any download). Instead of
// letting the request fail deep inside the download endpoints with a generic
// error, it blocks at the moment of intent and opens the shared blocking
// modal (rendered by the layout) with a Retry action.
export function useDownloadGuard() {
  const { qbittorrentBlocked, ensure } = useServiceHealth()

  // Shared across all guard call sites so exactly one modal can be open.
  const blockedService = useState<'qbittorrent' | null>('service-health-blocking', () => null)

  // The layout renders the modal only while the service is actually blocked,
  // so a successful Retry clears it without any manual close.
  const modalVisible = computed(() => blockedService.value === 'qbittorrent' && qbittorrentBlocked.value)

  async function guard(): Promise<boolean> {
    if (import.meta.server) return true
    await ensure()
    if (qbittorrentBlocked.value) {
      blockedService.value = 'qbittorrent'
      return false
    }
    return true
  }

  function clear() {
    blockedService.value = null
  }

  return { guard, modalVisible, clear }
}
