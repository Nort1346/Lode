export default defineNuxtRouteMiddleware((_to) => {
  const { user } = useUserSession()

  if (user.value?.role !== 'admin') {
    return navigateTo('/dashboard')
  }
})
