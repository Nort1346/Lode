import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Messages } from '#server/types/i18n'

const cache = new Map<string, Messages>()
const localesDir = resolve(dirname(fileURLToPath(import.meta.url)), '../../i18n/locales')

function loadLocale(code: string): Messages {
  const cached = cache.get(code)
  if (cached !== undefined) return cached
  try {
    const raw = readFileSync(resolve(localesDir, `${code}.json`), 'utf-8')
    const parsed = JSON.parse(raw) as Messages
    cache.set(code, parsed)
    return parsed
  } catch (err) {
    console.error(`[i18n] Failed to load locale "${code}" from ${localesDir}:`, err)
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
