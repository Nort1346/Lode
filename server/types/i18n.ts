export type DiscordLocale = 'pl' | 'en' | 'es' | 'fr' | 'de'

export interface Messages {
  [key: string]: string | Messages
}
