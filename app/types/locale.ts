export enum SupportedLocale {
  PL = 'pl',
  EN = 'en',
  DE = 'de',
  FR = 'fr',
  ES = 'es'
}

export const DEFAULT_LOCALE = SupportedLocale.EN

export const TMDB_LOCALE_MAP: Record<SupportedLocale, string> = {
  [SupportedLocale.PL]: 'pl-PL',
  [SupportedLocale.EN]: 'en-US',
  [SupportedLocale.DE]: 'de-DE',
  [SupportedLocale.FR]: 'fr-FR',
  [SupportedLocale.ES]: 'es-ES'
}
