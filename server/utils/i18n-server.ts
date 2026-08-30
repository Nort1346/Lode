import type { Messages } from '#server/types/i18n'

import pl from '@@/i18n/locales/pl.json'
import en from '@@/i18n/locales/en.json'
import de from '@@/i18n/locales/de.json'
import fr from '@@/i18n/locales/fr.json'
import es from '@@/i18n/locales/es.json'
import ptBR from '@@/i18n/locales/pt-BR.json'

const messages: Record<string, Messages> = { pl, en, de, fr, es, 'pt-BR': ptBR }

export const DISCORD_LOCALE_OPTIONS = ['pl', 'en', 'de', 'fr', 'es', 'pt-BR'] as const

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
