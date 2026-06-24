import { z } from 'zod'

const configSchema = z.object({
  savePathMovies: z.string().min(1),
  savePathSeries: z.string().min(1),
  quiProxyUrl: z.string().min(1),
  sessionPassword: z.string().min(1),
  tmdbApiKey: z.string().min(1),
  prowlarrApiKey: z.string().min(1),
  trackerEncryptionKey: z.string().min(1),
  jellyfinUrl: z.string().min(1),
  jellyfinApiKey: z.string().min(1)
})

export type ValidatedConfig = z.infer<typeof configSchema>

export function validateConfig(raw: Record<string, unknown>): ValidatedConfig {
  return configSchema.parse(raw)
}
