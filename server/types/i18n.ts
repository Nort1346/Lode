export type DiscordLocale = 'pl' | 'en' | 'es' | 'fr' | 'de' | 'pt-BR'

export interface Messages {
  [key: string]: string | Messages
}
