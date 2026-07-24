import type { Ref } from 'vue'

export function useCarouselOverflow(scrollRef: Ref<HTMLElement | null>, options?: { watchSource?: () => unknown }) {
  const hasOverflow = ref(false)
  const isAtStart = ref(true)
  const isAtEnd = ref(false)

  function scroll(direction: -1 | 1) {
    const el = scrollRef.value
    if (!el) return
    el.scrollBy({ left: direction * el.clientWidth * 0.75, behavior: 'smooth' })
  }

  function checkBounds() {
    const el = scrollRef.value
    if (!el) return
    isAtStart.value = el.scrollLeft <= 1
    isAtEnd.value = el.scrollLeft + el.clientWidth >= el.scrollWidth - 1
  }

  function checkOverflow() {
    const el = scrollRef.value
    if (!el) return
    hasOverflow.value = el.scrollWidth > el.clientWidth + 1
    checkBounds()
  }

  let resizeObserver: ResizeObserver | null = null
  let scrollHandler: (() => void) | null = null

  function setupObserver() {
    const el = scrollRef.value
    if (!el) return

    if (resizeObserver === null) {
      resizeObserver = new ResizeObserver(checkOverflow)
      resizeObserver.observe(el)
    }

    if (scrollHandler === null) {
      scrollHandler = checkBounds
      el.addEventListener('scroll', scrollHandler, { passive: true })
    }
  }

  onMounted(() => {
    nextTick(setupObserver)
  })

  onUnmounted(() => {
    resizeObserver?.disconnect()
    resizeObserver = null
    const el = scrollRef.value
    if (el && scrollHandler) {
      el.removeEventListener('scroll', scrollHandler)
    }
    scrollHandler = null
  })

  if (options?.watchSource !== undefined) {
    watch(options.watchSource, () => {
      nextTick(() => {
        checkOverflow()
        setupObserver()
      })
    })
  }

  return { hasOverflow, isAtStart, isAtEnd, scroll, checkOverflow }
}
