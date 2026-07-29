const INITIAL_DELAY = 100
const SWAP_INTERVAL = 2500
const FADE_DURATION = 300
const OVERLAY_KEYS = 10

export function useDownloadOverlay() {
  const { locale, t } = useI18n()
  const active = useState('download-overlay', () => false)
  const label = useState('download-overlay-label', () => '')
  const currentMessage = useState('download-overlay-current', () => '')
  const fading = useState('download-overlay-fading', () => false)

  let rotationTimer: ReturnType<typeof setTimeout> | null = null
  let swapTimer: ReturnType<typeof setInterval> | null = null
  let fadeTimer: ReturnType<typeof setTimeout> | null = null
  let pool: number[] = []
  let poolIndex = 0

  function shufflePool() {
    pool = Array.from({ length: OVERLAY_KEYS }, (_, i) => i)
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      const a = pool[i]
      const b = pool[j]
      if (a !== undefined && b !== undefined) {
        pool[i] = b
        pool[j] = a
      }
    }
    poolIndex = 0
  }

  function getNextMessage(): string {
    if (poolIndex >= pool.length) shufflePool()
    const key = `download.overlay.${pool[poolIndex]}`
    poolIndex++
    return t(key, {}, { locale: locale.value })
  }

  function startRotation() {
    rotationTimer = setTimeout(() => {
      swapTimer = setInterval(() => {
        fading.value = true
        fadeTimer = setTimeout(() => {
          currentMessage.value = getNextMessage()
          fading.value = false
        }, FADE_DURATION)
      }, SWAP_INTERVAL)
    }, INITIAL_DELAY)
  }

  function clearAllTimers() {
    if (rotationTimer) clearTimeout(rotationTimer)
    if (swapTimer) clearInterval(swapTimer)
    if (fadeTimer) clearTimeout(fadeTimer)
    rotationTimer = null
    swapTimer = null
    fadeTimer = null
  }

  function startDownload(downloadLabel = 'Adding torrent...') {
    active.value = true
    label.value = downloadLabel
    currentMessage.value = downloadLabel
    fading.value = false
    document.body.style.overflow = 'hidden'
    shufflePool()
    clearAllTimers()
    startRotation()
  }

  function finishDownload() {
    active.value = false
    clearAllTimers()
    fading.value = false
    document.body.style.overflow = ''
  }

  onUnmounted(() => {
    clearAllTimers()
    document.body.style.overflow = ''
  })

  return { active, label, currentMessage, fading, startDownload, finishDownload }
}
