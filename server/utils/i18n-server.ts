import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

type Messages = Record<string, string | Record<string, string>>

const cache = new Map<string, Messages>()
const localesDir = resolve(process.cwd(), 'i18n', 'locales')

function loadLocale(code: string): Messages {
  const cached = cache.get(code)
  if (cached !== undefined) return cached
  try {
    const raw = readFileSync(resolve(localesDir, `${code}.json`), 'utf-8')
    const parsed = JSON.parse(raw) as Messages
    cache.set(code, parsed)
    return parsed
  } catch {
    if (code !== 'pl') return loadLocale('pl')
    return {}
  }
}

export const DISCORD_LOCALE_OPTIONS = ['pl', 'en'] as const

export type DiscordLocale = (typeof DISCORD_LOCALE_OPTIONS)[number]

export function createT(locale: DiscordLocale) {
  const messages = loadLocale(locale)
  return (key: string): string => {
    const parts = key.split('.')
    let current: unknown = messages
    for (const part of parts) {
      if (current === null || current === undefined || typeof current !== 'object') return key
      current = (current as Record<string, unknown>)[part]
    }
    return typeof current === 'string' ? current : key
  }
}
