import type { BrowseSearchSource, SearchPhase, SearchResultItem } from '~/types/browse'

const SEARCH_DEBOUNCE_MS = 300
const SKELETON_DELAY_MS = 200

export function useBrowseSearch(source: BrowseSearchSource) {
  const phase = ref<SearchPhase>('idle')
  const results = ref<SearchResultItem[]>([])
  const showSkeletons = ref(false)

  let requestId = 0
  let controller: AbortController | null = null
  let debounceTimer: ReturnType<typeof setTimeout> | null = null
  let skeletonTimer: ReturnType<typeof setTimeout> | null = null

  const dimmed = computed(() => (phase.value === 'debouncing' || phase.value === 'loading') && results.value.length > 0)

  function isActive() {
    return source.q().trim().length >= 2 || source.genres().length > 0
  }

  function clearDebounce() {
    if (debounceTimer !== null) {
      clearTimeout(debounceTimer)
      debounceTimer = null
    }
  }

  function clearSkeletonTimer() {
    if (skeletonTimer !== null) {
      clearTimeout(skeletonTimer)
      skeletonTimer = null
    }
  }

  function abortRequest() {
    if (controller !== null) {
      controller.abort()
      controller = null
    }
    requestId++
  }

  function scheduleSkeletons(id: number) {
    showSkeletons.value = false
    clearSkeletonTimer()
    if (!import.meta.client) return
    skeletonTimer = setTimeout(() => {
      skeletonTimer = null
      if (id === requestId && phase.value === 'loading' && results.value.length === 0) {
        showSkeletons.value = true
      }
    }, SKELETON_DELAY_MS)
  }

  function startRequest() {
    clearDebounce()
    abortRequest()
    const id = ++requestId
    const current = new AbortController()
    controller = current
    phase.value = 'loading'

    if (results.value.length === 0) {
      scheduleSkeletons(id)
    } else {
      clearSkeletonTimer()
      showSkeletons.value = false
    }

    void (async () => {
      try {
        const data = await source.fetchResults(current.signal)
        if (id !== requestId) return
        results.value = data
        clearSkeletonTimer()
        showSkeletons.value = false
        phase.value = data.length > 0 ? 'success' : 'empty'
      } catch {
        if (id !== requestId) return
        clearSkeletonTimer()
        showSkeletons.value = false
        phase.value = 'error'
      }
    })()
  }

  function settle() {
    debounceTimer = null
    if (!isActive()) {
      abortRequest()
      clearSkeletonTimer()
      showSkeletons.value = false
      results.value = []
      phase.value = 'idle'
      return
    }
    startRequest()
  }

  function onInputChange() {
    abortRequest()
    if (!isActive() && phase.value === 'idle' && results.value.length === 0) return
    phase.value = 'debouncing'
    clearDebounce()
    debounceTimer = setTimeout(settle, SEARCH_DEBOUNCE_MS)
  }

  watch([() => source.q(), () => source.type(), () => source.locale()], onInputChange)
  watch(() => [...source.genres()], onInputChange)

  if (isActive()) {
    if (import.meta.client) {
      startRequest()
    } else {
      phase.value = 'loading'
    }
  }

  onUnmounted(() => {
    clearDebounce()
    clearSkeletonTimer()
    abortRequest()
  })

  return { phase, results, showSkeletons, dimmed }
}
