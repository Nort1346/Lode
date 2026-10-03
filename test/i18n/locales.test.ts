import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const LOCALES = ['en', 'pl', 'de', 'fr', 'es', 'pt-BR'] as const
type Locale = (typeof LOCALES)[number]

type Json = string | number | boolean | null | Json[] | { [key: string]: Json }

function loadLocale(locale: Locale): Json {
  const file = resolve(import.meta.dirname, '..', '..', 'i18n', 'locales', `${locale}.json`)
  return JSON.parse(readFileSync(file, 'utf8')) as Json
}

function flattenKeys(value: Json, prefix = ''): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => flattenKeys(item, prefix ? `${prefix}[${index}]` : `[${index}]`))
  }
  if (value !== null && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, child]) => flattenKeys(child, prefix ? `${prefix}.${key}` : key))
  }
  return [prefix]
}

function getApiError(locale: Locale): { [key: string]: Json } {
  const root = loadLocale(locale)
  if (root === null || typeof root !== 'object' || Array.isArray(root)) throw new Error(`${locale}: root is not an object`)
  const apiError = root.apiError
  if (apiError === null || typeof apiError !== 'object' || Array.isArray(apiError)) {
    throw new Error(`${locale}: missing apiError object`)
  }
  return apiError
}

describe('locale files', () => {
  it('all six locales share the same key set', () => {
    const reference = new Set(flattenKeys(loadLocale('en')))
    for (const locale of LOCALES) {
      const keys = new Set(flattenKeys(loadLocale(locale)))
      const missing = [...reference].filter((key) => !keys.has(key))
      const extra = [...keys].filter((key) => !reference.has(key))
      expect({ locale, missing, extra }).toEqual({ locale, missing: [], extra: [] })
    }
  })

  it('defines all 19 apiError Title/Desc pairs in every locale', () => {
    const pairs = [
      'generic',
      'badRequest',
      'session',
      'forbidden',
      'notFound',
      'timeout',
      'conflict',
      'tooLarge',
      'invalid',
      'cooldown',
      'limit',
      'rateLimit',
      'server',
      'upstream',
      'unavailable',
      'network',
      'aborted',
      'client4xx',
      'server5xx'
    ]
    for (const locale of LOCALES) {
      const apiError = getApiError(locale)
      for (const pair of pairs) {
        expect(apiError[`${pair}Title`], `${locale}.${pair}Title`).toBeTypeOf('string')
        expect(apiError[`${pair}Desc`], `${locale}.${pair}Desc`).toBeTypeOf('string')
        expect(String(apiError[`${pair}Title`]).length, `${locale}.${pair}Title`).toBeGreaterThan(0)
        expect(String(apiError[`${pair}Desc`]).length, `${locale}.${pair}Desc`).toBeGreaterThan(0)
      }
    }
  })

  it('has the right plural segment count for apiError.cooldownDesc per locale', () => {
    const expected: Record<Locale, number> = { en: 2, pl: 4, de: 2, fr: 2, es: 2, 'pt-BR': 2 }
    for (const locale of LOCALES) {
      const raw = getApiError(locale).cooldownDesc
      expect(raw, locale).toBeTypeOf('string')
      const segments = String(raw).split(' | ')
      expect(segments.length, locale).toBe(expected[locale])
      for (const segment of segments) {
        expect(segment, `${locale}: ${segment}`).toContain('{count}')
      }
    }
  })
})
