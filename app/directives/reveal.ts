import type { Directive, DirectiveBinding } from 'vue'

const callbacks = new WeakMap<HTMLElement, () => void>()

let sharedObserver: IntersectionObserver | null = null

function getObserver(): IntersectionObserver {
  if (!sharedObserver) {
    sharedObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const cb = callbacks.get(entry.target as HTMLElement)
            if (cb) cb()
          }
        }
      },
      { rootMargin: '100px', threshold: 0 }
    )
  }
  return sharedObserver
}

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

    function onReveal() {
      el.classList.add('revealed')
      getObserver().unobserve(el)
      callbacks.delete(el)
    }

    callbacks.set(el, onReveal)
    getObserver().observe(el)
  },

  unmounted(el: HTMLElement) {
    getObserver().unobserve(el)
    callbacks.delete(el)
  },

  getSSRProps() {
    return {}
  }
}
