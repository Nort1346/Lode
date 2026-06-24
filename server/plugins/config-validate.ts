export default defineNitroPlugin(() => {
  const config = useRuntimeConfig()

  const required: Record<string, string> = {
    savePathMovies: String(config.savePathMovies ?? ''),
    savePathSeries: String(config.savePathSeries ?? '')
  }

  for (const [key, value] of Object.entries(required)) {
    if (!value) {
      const envKey = `NUXT_${key.replace(/([A-Z])/g, '_$1').toUpperCase()}`
      throw new Error(
        `[Config] Required environment variable ${envKey} is not set. ` +
          `Set it in your .env file or docker-compose environment.`
      )
    }
  }
})
