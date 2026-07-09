import { z } from 'zod'

const configSchema = z.object({
  savePathMovies: z.string().min(1),
  savePathSeries: z.string().min(1),
  qbittorrentUrl: z.url().default('http://localhost:8080'),
  qbittorrentApiKey: z.string().min(1),
  sessionPassword: z.string().min(32),
  tmdbApiKey: z.string().min(1),
  prowlarrApiKey: z.string().min(1),
  trackerEncryptionKey: z.string().min(1),
  jellyfinUrl: z.string().optional(),
  jellyfinApiKey: z.string().optional()
})

export type ValidatedConfig = z.infer<typeof configSchema>

export function validateConfig(raw: Record<string, unknown>): ValidatedConfig {
  return configSchema.parse(raw)
}
