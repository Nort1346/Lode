export default defineNuxtRouteMiddleware(async () => {
  const { user } = useUserSession()
  if (user.value?.role === 'admin') return

  try {
    const me = await $fetch<{ canSubmit: boolean }>('/api/user/me')
    if (me.canSubmit !== true) {
      return navigateTo('/dashboard')
    }
  } catch {
    return navigateTo('/dashboard')
  }
})
