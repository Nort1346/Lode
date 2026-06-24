export type DiscordLocale = 'pl' | 'en'

export interface Messages {
  [key: string]: string | Messages
}
