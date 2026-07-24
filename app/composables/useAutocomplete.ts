import type { AutocompleteSuggestion } from '~/types/autocomplete'

export function useAutocomplete(query: Ref<string>, type: Ref<string>, locale: Ref<string>) {
  const suggestions = ref<AutocompleteSuggestion[]>([])
  const isOpen = ref(false)
  const isMobile = ref(false)
  let debounceTimer: ReturnType<typeof setTimeout> | null = null
  let resizeTimer: ReturnType<typeof setTimeout> | null = null

  function checkMobile() {
    isMobile.value = window.innerWidth < 768
  }

  function onResize() {
    if (resizeTimer !== null) clearTimeout(resizeTimer)
    resizeTimer = setTimeout(checkMobile, 100)
  }

  function fetchSuggestions() {
    if (debounceTimer !== null) clearTimeout(debounceTimer)
    if (query.value.length < 2 || !isMobile.value) {
      suggestions.value = []
      isOpen.value = false
      return
    }
    debounceTimer = setTimeout(async () => {
      try {
        const data = await $fetch<{ suggestions: AutocompleteSuggestion[] }>('/api/browse/autocomplete', {
          query: { q: query.value, type: type.value, locale: locale.value }
        })
        suggestions.value = data.suggestions
        isOpen.value = data.suggestions.length > 0
      } catch {
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

  onMounted(() => {
    checkMobile()
    window.addEventListener('resize', onResize)
  })

  onUnmounted(() => {
    if (debounceTimer !== null) clearTimeout(debounceTimer)
    if (resizeTimer !== null) clearTimeout(resizeTimer)
    window.removeEventListener('resize', onResize)
  })

  return { suggestions, isOpen, isMobile, close }
}
