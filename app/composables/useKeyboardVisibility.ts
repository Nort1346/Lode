import { onMounted, onUnmounted, ref } from 'vue'

/**
 * Tracks whether the on-screen (virtual) keyboard is covering the viewport.
 *
 * Platforms disagree on how the keyboard resizes the window: iOS Safari keeps
 * `window.innerHeight` at full height and only shrinks the visual viewport,
 * while Android Chrome resizes the layout viewport down to the visible area
 * (so `innerHeight` and `visualViewport.height` move together). To work on
 * both, the visual height is compared against the LARGER of the live layout
 * height and a baseline captured while the keyboard was last closed.
 *
 * The 100px default threshold ignores small shifts (browser chrome collapse,
 * safe-area rounding) that are not the keyboard.
 */
export function useKeyboardVisibility(threshold = 100) {
  const visible = ref(false)
  let baseline = 0

  function update() {
    const vv = window.visualViewport
    if (!vv) {
      visible.value = false
      return
    }
    const reference = Math.max(window.innerHeight, baseline)
    visible.value = reference - vv.height > threshold
    if (!visible.value) baseline = vv.height
  }

  onMounted(() => {
    baseline = window.visualViewport ? window.visualViewport.height : window.innerHeight
    update()
    window.visualViewport?.addEventListener('resize', update)
    window.addEventListener('resize', update)
  })

  onUnmounted(() => {
    window.visualViewport?.removeEventListener('resize', update)
    window.removeEventListener('resize', update)
  })

  return { visible }
}
