const STORAGE_KEY = 'streamhub-media-language'

export const MEDIA_LANGUAGE_OPTIONS: Array<{ label: string; value: string; icon?: string }> = [
  { label: 'Original', value: 'original', icon: 'i-lucide-languages' },
  { label: 'English', value: 'en' },
  { label: 'Polski', value: 'pl' },
  { label: 'Deutsch', value: 'de' },
  { label: 'Français', value: 'fr' },
  { label: 'Español', value: 'es' }
]

export const LANGUAGE_NAMES: Record<string, string> = {
  en: 'English',
  pl: 'Polski',
  de: 'Deutsch',
  fr: 'Français',
  es: 'Español',
  ja: '日本語',
  ko: '한국어',
  zh: '中文',
  pt: 'Português',
  it: 'Italiano',
  ru: 'Русский',
  ar: 'العربية',
  hi: 'हिन्दी',
  tr: 'Türkçe',
  nl: 'Nederlands',
  sv: 'Svenska',
  da: 'Dansk',
  fi: 'Suomi',
  no: 'Norsk',
  cs: 'Čeština',
  el: 'Ελληνικά',
  he: 'עברית',
  th: 'ไทย',
  vi: 'Tiếng Việt',
  id: 'Bahasa Indonesia',
  ms: 'Bahasa Melayu',
  uk: 'Українська',
  ro: 'Română',
  hu: 'Magyar',
  hr: 'Hrvatski',
  bg: 'Български',
  sk: 'Slovenčina',
  sl: 'Slovenščina',
  lt: 'Lietuvių',
  lv: 'Latviešu',
  et: 'Eesti'
}

function readStorage(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? 'original'
  } catch {
    return 'original'
  }
}

function writeStorage(value: string) {
  try {
    localStorage.setItem(STORAGE_KEY, value)
  } catch {
    /* private browsing */
  }
}

export function useMediaLanguage() {
  const mediaLanguage = useState<string>('mediaLanguage', () => readStorage())
  const { t } = useI18n()

  watch(mediaLanguage, (val) => {
    writeStorage(val)
  })

  function originalLabel(origName: string): string {
    return origName ? t('common.originalWithName', { name: origName }) : t('common.original')
  }

  function getLanguageOptions(originalLanguage?: string) {
    const origName = originalLanguage ? (LANGUAGE_NAMES[originalLanguage] ?? originalLanguage) : ''
    return MEDIA_LANGUAGE_OPTIONS.map((opt) => {
      if (opt.value === 'original') {
        return { ...opt, label: originalLabel(origName) }
      }
      return opt
    })
  }

  function getCurrentLanguageLabel(originalLanguage?: string): string {
    if (mediaLanguage.value === 'original') {
      const origName = originalLanguage ? (LANGUAGE_NAMES[originalLanguage] ?? originalLanguage) : ''
      return originalLabel(origName)
    }
    return LANGUAGE_NAMES[mediaLanguage.value] ?? mediaLanguage.value
  }

  return { mediaLanguage, getLanguageOptions, getCurrentLanguageLabel }
}
