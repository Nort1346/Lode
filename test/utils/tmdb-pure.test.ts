import { describe, it, expect, vi } from 'vitest'

vi.mock('#server/utils/cache', () => ({
  cacheGet: vi.fn(),
  cacheSet: vi.fn(),
  CACHE_TTL: 0
}))

vi.mock('h3', () => ({
  useRuntimeConfig: vi.fn(() => ({ tmdbApiKey: 'test-key' }))
}))

import { resolveTmdbLanguage, getImageUrl } from '#server/utils/tmdb'

describe('resolveTmdbLanguage', () => {
  it('maps pl to pl-PL', () => {
    expect(resolveTmdbLanguage('pl')).toBe('pl-PL')
  })

  it('maps en to en-US', () => {
    expect(resolveTmdbLanguage('en')).toBe('en-US')
  })

  it('maps de to de-DE', () => {
    expect(resolveTmdbLanguage('de')).toBe('de-DE')
  })

  it('maps fr to fr-FR', () => {
    expect(resolveTmdbLanguage('fr')).toBe('fr-FR')
  })

  it('maps es to es-ES', () => {
    expect(resolveTmdbLanguage('es')).toBe('es-ES')
  })

  it('maps pt to pt-BR', () => {
    expect(resolveTmdbLanguage('pt')).toBe('pt-BR')
  })

  it('maps pt-BR to pt-BR', () => {
    expect(resolveTmdbLanguage('pt-BR')).toBe('pt-BR')
  })

  it('falls back to en-US for unknown locale', () => {
    expect(resolveTmdbLanguage('unknown')).toBe('en-US')
  })
})

describe('getImageUrl', () => {
  it('returns full URL for given path and default size', () => {
    expect(getImageUrl('/abc.jpg')).toBe('https://image.tmdb.org/t/p/w342/abc.jpg')
  })

  it('returns null when path is null', () => {
    expect(getImageUrl(null)).toBeNull()
  })

  it('uses specified size', () => {
    expect(getImageUrl('/test.png', 'original')).toBe('https://image.tmdb.org/t/p/original/test.png')
  })

  it('uses w92 size when specified', () => {
    expect(getImageUrl('/x.jpg', 'w92')).toBe('https://image.tmdb.org/t/p/w92/x.jpg')
  })
})
