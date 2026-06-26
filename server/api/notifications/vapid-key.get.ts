export default defineEventHandler(() => {
  const config = useRuntimeConfig()
  const publicKey = config.public.vapidPublicKey as string
  return { publicKey }
})
