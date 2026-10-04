import type {} from 'vue-i18n'

type EnMessages = typeof import('../i18n/locales/en.json')

type DotNested<T, Prefix extends string = ''> = T extends string
  ? never
  : {
      [K in Extract<keyof T, string>]: T[K] extends string
        ? `${Prefix}${K}`
        : T[K] extends Record<string, string | Record<string, unknown>>
          ? DotNested<T[K], `${Prefix}${K}.`>
          : never
    }[Extract<keyof T, string>]

export type I18nKey = DotNested<EnMessages>

declare module 'vue-i18n' {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface DefineLocaleMessage extends EnMessages {}
}
