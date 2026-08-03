const MARQUEE_SPEED = 35
const FADE_MS = 500
const WAIT_BEFORE_SCROLL = 300

export function useMarquee() {
  const containerRef = ref<HTMLElement | null>(null)
  const textRef = ref<HTMLElement | null>(null)
  const isVisible = ref(false)
  const isOverflowing = ref(false)
  const scrollDistance = ref(0)
  const textOpacity = ref(1)
  const isScrolling = ref(false)
  const phase = ref<'first' | 'loop'>('first')

  const marqueeDuration = computed(() => scrollDistance.value / MARQUEE_SPEED)

  let timers: ReturnType<typeof setTimeout>[] = []

  function schedule(fn: () => void, ms: number) {
    const id = setTimeout(fn, ms)
    timers.push(id)
    return id
  }

  function clearTimers() {
    for (const id of timers) clearTimeout(id)
    timers = []
  }

  function runIteration() {
    textOpacity.value = 0
    nextTick(() => {
      textOpacity.value = 1
    })

    schedule(() => {
      isScrolling.value = true

      const fadeOutAt = marqueeDuration.value * 750
      schedule(() => {
        textOpacity.value = 0

        schedule(() => {
          isScrolling.value = false
          phase.value = 'loop'
          nextTick(runIteration)
        }, FADE_MS)
      }, fadeOutAt)
    }, FADE_MS + WAIT_BEFORE_SCROLL)
  }

  function startSequence() {
    clearTimers()
    runIteration()
  }

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

  function resetPhase() {
    phase.value = 'first'
    textOpacity.value = 1
    isScrolling.value = false
    clearTimers()
  }

  watch(isOverflowing, (overflowing) => {
    if (overflowing) {
      startSequence()
    } else {
      clearTimers()
      isScrolling.value = false
    }
  })

  let observer: IntersectionObserver | null = null

  onMounted(() => {
    observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const wasVisible = isVisible.value
          isVisible.value = entry.isIntersecting
          if (!entry.isIntersecting && wasVisible) {
            resetPhase()
          } else if (entry.isIntersecting && !wasVisible && isOverflowing.value) {
            startSequence()
          }
        }
      },
      { threshold: 0.1 }
    )
    if (containerRef.value) observer.observe(containerRef.value)

    nextTick(checkOverflow)

    const ro = new ResizeObserver(checkOverflow)
    if (containerRef.value) ro.observe(containerRef.value)

    onUnmounted(() => {
      observer?.disconnect()
      ro.disconnect()
      clearTimers()
    })
  })

  return {
    containerRef,
    textRef,
    isVisible,
    isOverflowing,
    scrollDistance,
    marqueeDuration,
    textOpacity,
    isScrolling,
    phase,
    recheck: checkOverflow
  }
}
