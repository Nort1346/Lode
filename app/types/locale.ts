export enum SupportedLocale {
  PL = 'pl',
  EN = 'en'
}

export const DEFAULT_LOCALE = SupportedLocale.EN

export const TMDB_LOCALE_MAP: Record<SupportedLocale, string> = {
  [SupportedLocale.PL]: 'pl-PL',
  [SupportedLocale.EN]: 'en-US'
}
