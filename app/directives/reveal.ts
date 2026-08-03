import type { Directive, DirectiveBinding } from 'vue'
import type { RevealState } from '~/types/directives'

const state = new WeakMap<HTMLElement, RevealState>()

function getDelay(value: unknown): string {
  if (typeof value === 'number' && value >= 1 && value <= 3) {
    return `reveal-delay-${value}`
  }
  return ''
}

export const vReveal: Directive = {
  mounted(el: HTMLElement, binding: DirectiveBinding) {
    const isFade = binding.value === 'fade'
    el.classList.add(isFade ? 'fade-in' : 'reveal')

    const delayClass = getDelay(binding.value)
    if (delayClass) el.classList.add(delayClass)

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            el.classList.add('revealed')
            observer.disconnect()
            break
          }
        }
      },
      { rootMargin: '100px' }
    )

    observer.observe(el)
    state.set(el, { observer })
  },

  unmounted(el: HTMLElement) {
    const s = state.get(el)
    if (s) {
      s.observer.disconnect()
      state.delete(el)
    }
  },

  getSSRProps() {
    return {}
  }
}
