import type { Ref } from 'vue'

export function useCarouselOverflow(scrollRef: Ref<HTMLElement | null>, options?: { watchSource?: () => unknown }) {
  const hasOverflow = ref(false)

  function scroll(direction: -1 | 1) {
    const el = scrollRef.value
    if (!el) return
    el.scrollBy({ left: direction * el.clientWidth * 0.75, behavior: 'smooth' })
  }

  function checkOverflow() {
    const el = scrollRef.value
    if (!el) return
    hasOverflow.value = el.scrollWidth > el.clientWidth + 1
  }

  let resizeObserver: ResizeObserver | null = null

  function setupObserver() {
    const el = scrollRef.value
    if (!el || resizeObserver !== null) return
    resizeObserver = new ResizeObserver(checkOverflow)
    resizeObserver.observe(el)
  }

  onMounted(() => {
    nextTick(setupObserver)
  })

  onUnmounted(() => {
    resizeObserver?.disconnect()
  })

  if (options?.watchSource !== undefined) {
    watch(options.watchSource, () => {
      nextTick(() => {
        checkOverflow()
        setupObserver()
      })
    })
  }

  return { hasOverflow, scroll, checkOverflow }
}
