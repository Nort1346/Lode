export function useReveal(options?: { rootMargin?: string }) {
  const root = ref<HTMLElement | null>(null)
  const revealed = ref(false)

  onMounted(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            revealed.value = true
            observer.disconnect()
            break
          }
        }
      },
      { rootMargin: options?.rootMargin ?? '100px' }
    )
    if (root.value) observer.observe(root.value)
    onUnmounted(() => observer.disconnect())
  })

  return { root, revealed }
}
