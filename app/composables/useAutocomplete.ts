import type { AutocompleteSuggestion } from '~/types/autocomplete'

export function useAutocomplete(query: Ref<string>, type: Ref<string>, locale: Ref<string>) {
  const suggestions = ref<AutocompleteSuggestion[]>([])
  const isOpen = ref(false)
  const { smallerThan } = useBreakpoints()
  let debounceTimer: ReturnType<typeof setTimeout> | null = null
  // Invalidates in-flight requests: only the latest query may write its results
  let requestId = 0

  const isMobile = computed(() => smallerThan('md'))

  function fetchSuggestions() {
    if (debounceTimer !== null) clearTimeout(debounceTimer)
    requestId++
    if (query.value.length < 2 || !isMobile.value) {
      suggestions.value = []
      isOpen.value = false
      return
    }
    const id = requestId
    debounceTimer = setTimeout(async () => {
      try {
        const data = await $fetch<{ suggestions: AutocompleteSuggestion[] }>('/api/browse/autocomplete', {
          query: { q: query.value, type: type.value, locale: locale.value }
        })
        if (id !== requestId) return
        suggestions.value = data.suggestions
        isOpen.value = data.suggestions.length > 0
      } catch {
        if (id !== requestId) return
        suggestions.value = []
        isOpen.value = false
      }
    }, 300)
  }

  function close() {
    isOpen.value = false
  }

  watch([query, type, locale], () => {
    fetchSuggestions()
  })

  onUnmounted(() => {
    if (debounceTimer !== null) clearTimeout(debounceTimer)
  })

  return { suggestions, isOpen, isMobile, close }
}
