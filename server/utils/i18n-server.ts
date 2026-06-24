import type { Messages } from '#server/types/i18n'

import pl from '@@/i18n/locales/pl.json'
import en from '@@/i18n/locales/en.json'

const messages: Record<string, Messages> = { pl, en }

export const DISCORD_LOCALE_OPTIONS = ['pl', 'en'] as const

export type DiscordLocale = (typeof DISCORD_LOCALE_OPTIONS)[number]

export function createT(locale: DiscordLocale) {
  const msgs = messages[locale] ?? messages.en
  return (key: string): string => {
    const parts = key.split('.')
    let current: unknown = msgs
    for (const part of parts) {
      if (current === null || current === undefined || typeof current !== 'object') return key
      current = (current as Record<string, unknown>)[part]
    }
    return typeof current === 'string' ? current : key
  }
}
