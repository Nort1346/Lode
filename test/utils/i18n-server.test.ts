import { describe, it, expect, vi } from 'vitest'

vi.mock('@@/i18n/locales/pl.json', () => ({
  default: {
    nav: { dashboard: 'Panel' },
    theme: { light: 'Jasny', dark: 'Ciemny' }
  }
}))
vi.mock('@@/i18n/locales/en.json', () => ({
  default: {
    nav: { dashboard: 'Dashboard' },
    theme: { light: 'Light Mode', dark: 'Dark Mode' }
  }
}))
vi.mock('@@/i18n/locales/de.json', () => ({
  default: {
    nav: { dashboard: 'Dashboard' },
    theme: { light: 'Heller Modus', dark: 'Dunkler Modus' }
  }
}))
vi.mock('@@/i18n/locales/fr.json', () => ({
  default: {
    nav: { dashboard: 'Tableau de bord' },
    theme: { light: 'Mode clair', dark: 'Mode sombre' }
  }
}))
vi.mock('@@/i18n/locales/es.json', () => ({
  default: {
    nav: { dashboard: 'Panel' },
    theme: { light: 'Modo claro', dark: 'Modo oscuro' }
  }
}))
vi.mock('@@/i18n/locales/pt-BR.json', () => ({
  default: {
    nav: { dashboard: 'Painel' },
    theme: { light: 'Modo Claro', dark: 'Modo Escuro' }
  }
}))

import { createT, DISCORD_LOCALE_OPTIONS } from '#server/utils/i18n-server'

describe('i18n-server', () => {
  it('resolves known key for English locale', () => {
    const t = createT('en')
    expect(t('nav.dashboard')).toBe('Dashboard')
  })

  it('resolves known key for Polish locale', () => {
    const t = createT('pl')
    expect(t('nav.dashboard')).toBe('Panel')
  })

  it('resolves French locale', () => {
    const t = createT('fr')
    expect(t('nav.dashboard')).toBe('Tableau de bord')
  })

  it('resolves pt-BR locale', () => {
    const t = createT('pt-BR')
    expect(t('nav.dashboard')).toBe('Painel')
  })

  it('returns key when key does not exist', () => {
    const t = createT('en')
    expect(t('nonexistent.key')).toBe('nonexistent.key')
  })

  it('navigates nested objects correctly', () => {
    const t = createT('en')
    expect(t('theme.light')).toBe('Light Mode')
  })

  it('DISCORD_LOCALE_OPTIONS has correct locales', () => {
    expect(DISCORD_LOCALE_OPTIONS).toEqual(['pl', 'en', 'de', 'fr', 'es', 'pt-BR'])
  })
})
