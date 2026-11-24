// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { createApp, defineComponent, h, type App, type Ref } from 'vue'
import { useKeyboardVisibility } from '../../../app/composables/useKeyboardVisibility'

class FakeVisualViewport {
  height: number
  private listeners: Array<() => void> = []

  constructor(height: number) {
    this.height = height
  }

  addEventListener(_type: string, listener: () => void) {
    this.listeners.push(listener)
  }

  removeEventListener(_type: string, listener: () => void) {
    this.listeners = this.listeners.filter((l) => l !== listener)
  }

  /** Simulates a viewport change (keyboard open/close, orientation change) */
  emit() {
    for (const listener of [...this.listeners]) listener()
  }
}

let visible: Ref<boolean>
let viewport: FakeVisualViewport | undefined
let app: App
let root: HTMLElement
let orientationAngle = 0

Object.defineProperty(window.screen, 'orientation', {
  configurable: true,
  get: () => ({ angle: orientationAngle })
})

/** Pass `null` as initialHeight to simulate a browser without visualViewport */
function mount(initialHeight: number | null, innerHeight: number, threshold = 100) {
  viewport = initialHeight === null ? undefined : new FakeVisualViewport(initialHeight)
  Object.defineProperty(window, 'visualViewport', { value: viewport, configurable: true })
  Object.defineProperty(window, 'innerHeight', { value: innerHeight, configurable: true })
  visible = null as unknown as Ref<boolean>
  root = document.createElement('div')
  document.body.appendChild(root)
  app = createApp(
    defineComponent({
      setup() {
        const { visible: v } = useKeyboardVisibility(threshold)
        visible = v
        return () => h('div')
      }
    })
  )
  app.mount(root)
}

function setViewport(height: number, innerHeight: number | null = null) {
  if (!viewport) return
  viewport.height = height
  if (innerHeight !== null) {
    Object.defineProperty(window, 'innerHeight', { value: innerHeight, configurable: true })
  }
  viewport.emit()
}

describe('useKeyboardVisibility', () => {
  afterEach(() => {
    app.unmount()
    root.remove()
    orientationAngle = 0
  })

  it('starts hidden and detects the keyboard when the visual viewport shrinks (iOS behaviour)', () => {
    // iOS keeps the layout viewport (innerHeight) at full height
    mount(800, 800)
    expect(visible.value).toBe(false)

    setViewport(420)
    expect(visible.value).toBe(true)
  })

  it('detects the keyboard when the layout viewport shrinks too (Android behaviour)', () => {
    mount(800, 800)

    setViewport(420, 420)
    expect(visible.value).toBe(true)
  })

  it('reports hidden again when the keyboard closes, and detects a later open', () => {
    mount(800, 800)

    setViewport(420)
    expect(visible.value).toBe(true)

    setViewport(800, 800)
    expect(visible.value).toBe(false)

    // baseline must track the closed height so the next open is still seen
    setViewport(450, 450)
    expect(visible.value).toBe(true)
  })

  it('ignores small shifts below the threshold (browser chrome collapse)', () => {
    mount(800, 800)

    setViewport(750)
    expect(visible.value).toBe(false)
  })

  it('respects a custom threshold', () => {
    mount(800, 800, 200)

    setViewport(650)
    expect(visible.value).toBe(false)

    setViewport(550)
    expect(visible.value).toBe(true)
  })

  it('re-baselines on rotation so landscape is not mistaken for an open keyboard', () => {
    mount(800, 800)
    expect(visible.value).toBe(false)

    orientationAngle = 90
    setViewport(400, 400)
    expect(visible.value).toBe(false)

    // The keyboard can still be detected in the new orientation
    setViewport(220, 220)
    expect(visible.value).toBe(true)
  })

  it('reports hidden when visualViewport is unavailable', () => {
    mount(null, 800)

    expect(visible.value).toBe(false)
  })
})
