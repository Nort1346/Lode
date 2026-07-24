const TAILWIND_BREAKPOINTS = {
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
  '2xl': 1536
} as const

export type Breakpoint = keyof typeof TAILWIND_BREAKPOINTS

export function useBreakpoints() {
  const width = ref(0)

  function update() {
    width.value = window.innerWidth
  }

  function greaterOrEqual(bp: Breakpoint): boolean {
    return width.value >= TAILWIND_BREAKPOINTS[bp]
  }

  function smallerThan(bp: Breakpoint): boolean {
    return width.value < TAILWIND_BREAKPOINTS[bp]
  }

  let resizeTimer: ReturnType<typeof setTimeout> | null = null

  function onResize() {
    if (resizeTimer !== null) clearTimeout(resizeTimer)
    resizeTimer = setTimeout(update, 100)
  }

  onMounted(() => {
    update()
    window.addEventListener('resize', onResize)
  })

  onUnmounted(() => {
    if (resizeTimer !== null) clearTimeout(resizeTimer)
    window.removeEventListener('resize', onResize)
  })

  return { width, greaterOrEqual, smallerThan }
}
