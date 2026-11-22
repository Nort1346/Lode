// `useColorMode()` only resolves the `system` preference on the client (an inline
// <head> script runs before hydration). On the server `colorMode.value` stays
// `system`, so the toggle renders as if the app were light and the first client
// render then flips to the actually resolved mode, which triggers Vue hydration
// mismatch warnings. Keeping the server assumption until after mount keeps
// hydration clean; the icon and label update on the first client tick.
export function useThemeToggle() {
  const colorMode = useColorMode()

  const mounted = ref(false)
  onMounted(() => {
    mounted.value = true
  })

  const isDark = computed(() => mounted.value && colorMode.value === 'dark')

  function toggleTheme() {
    colorMode.preference = colorMode.value === 'dark' ? 'light' : 'dark'
  }

  return { isDark, toggleTheme }
}
