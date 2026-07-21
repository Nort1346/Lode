export function useMarquee() {
  const containerRef = ref<HTMLElement | null>(null)
  const textRef = ref<HTMLElement | null>(null)
  const isVisible = ref(false)
  const isOverflowing = ref(false)
  const scrollDistance = ref(0)
  const phase = ref<'first' | 'loop'>('first')

  function checkOverflow() {
    const container = containerRef.value
    const text = textRef.value
    if (!container || !text) {
      isOverflowing.value = false
      return
    }
    const hOverflow = text.scrollWidth - container.clientWidth
    const vOverflow = text.scrollHeight - container.clientHeight
    isOverflowing.value = hOverflow > 0 || vOverflow > 0
    scrollDistance.value = Math.max(hOverflow, 0)
  }

  function onAnimationEnd() {
    phase.value = 'loop'
  }

  function resetPhase() {
    phase.value = 'first'
  }

  let observer: IntersectionObserver | null = null

  onMounted(() => {
    observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const wasVisible = isVisible.value
          isVisible.value = entry.isIntersecting
          if (!entry.isIntersecting && wasVisible) {
            resetPhase()
          }
        }
      },
      { threshold: 0.1 }
    )
    if (containerRef.value) observer.observe(containerRef.value)

    nextTick(checkOverflow)

    const ro = new ResizeObserver(checkOverflow)
    if (containerRef.value) ro.observe(containerRef.value)

    watch(
      () => textRef.value,
      (el, _old) => {
        if (_old) _old.removeEventListener('animationend', onAnimationEnd)
        if (el) el.addEventListener('animationend', onAnimationEnd)
      }
    )

    onUnmounted(() => {
      observer?.disconnect()
      ro.disconnect()
      if (textRef.value) textRef.value.removeEventListener('animationend', onAnimationEnd)
    })
  })

  return { containerRef, textRef, isVisible, isOverflowing, scrollDistance, phase, recheck: checkOverflow }
}
