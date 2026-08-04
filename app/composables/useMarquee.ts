const MARQUEE_SPEED = 60
const OVERFLOW_THRESHOLD = 5
const GAP_PX = 40

export function useMarquee() {
  const containerRef = ref<HTMLElement | null>(null)
  const textRef = ref<HTMLElement | null>(null)
  const isOverflowing = ref(false)
  const isMeasured = ref(false)
  const textWidth = ref(0)

  const marqueeDuration = computed(() => {
    if (!isOverflowing.value || textWidth.value === 0) return 0
    return (textWidth.value + GAP_PX) / MARQUEE_SPEED
  })

  function checkOverflow() {
    const container = containerRef.value
    if (!container || textWidth.value === 0) return
    isOverflowing.value = textWidth.value - container.clientWidth > OVERFLOW_THRESHOLD
  }

  function measure() {
    const container = containerRef.value
    const text = textRef.value
    if (!container || !text) return

    const clone = text.cloneNode(true) as HTMLElement
    clone.style.position = 'absolute'
    clone.style.visibility = 'hidden'
    clone.style.whiteSpace = 'nowrap'
    clone.style.width = 'auto'
    document.body.appendChild(clone)

    const fullWidth = clone.scrollWidth
    document.body.removeChild(clone)

    textWidth.value = fullWidth
    isMeasured.value = true
    isOverflowing.value = fullWidth - container.clientWidth > OVERFLOW_THRESHOLD
  }

  let ro: ResizeObserver | null = null
  let mounted = true

  onMounted(() => {
    nextTick(() => {
      requestAnimationFrame(() => {
        if (!mounted) return
        measure()
        const container = containerRef.value
        if (container) {
          ro = new ResizeObserver(checkOverflow)
          ro.observe(container)
        }
      })
    })

    onUnmounted(() => {
      mounted = false
      ro?.disconnect()
      ro = null
    })
  })

  return {
    containerRef,
    textRef,
    isOverflowing,
    isMeasured,
    marqueeDuration
  }
}
