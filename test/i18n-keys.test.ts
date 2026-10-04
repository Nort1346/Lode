import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { resolve, join } from 'node:path'

const ROOT = process.cwd()
const LOCALES_DIR = resolve(ROOT, 'i18n/locales')
const SOURCE_LOCALE = 'en'

type JsonValue = string | { [key: string]: JsonValue }

function flattenKeys(obj: JsonValue, prefix = ''): string[] {
  if (typeof obj === 'string') return prefix === '' ? [] : [prefix]
  return Object.entries(obj).flatMap(([key, value]) =>
    typeof value === 'string' ? [`${prefix}${key}`] : flattenKeys(value, `${prefix}${key}.`)
  )
}

function readJson(filePath: string): JsonValue {
  return JSON.parse(readFileSync(filePath, 'utf8')) as JsonValue
}

function collectSourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    const stat = statSync(full)
    if (stat.isDirectory()) {
      collectSourceFiles(full, out)
    } else if (full.endsWith('.vue') || full.endsWith('.ts')) {
      out.push(full)
    }
  }
  return out
}

const CALL_RE = /([A-Za-z_$][\w$]*)\(\s*['"`]([^'"`]+?)['"`]/g
const I18N_CALLS = new Set(['t', '$t', 'tc'])

function extractStaticKeys(source: string): string[] {
  const keys: string[] = []
  CALL_RE.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = CALL_RE.exec(source)) !== null) {
    const callee = match[1]
    const key = match[2]
    if (callee === undefined || key === undefined) continue
    if (!I18N_CALLS.has(callee)) continue
    // Dynamic template keys (e.g. t(`a.${x}`)) cannot be checked statically
    if (key.includes('${')) continue
    keys.push(key)
  }
  return keys
}

describe('i18n keys (en is source of truth)', () => {
  it('every locale contains exactly the same keys as en', () => {
    const enKeys = new Set(flattenKeys(readJson(resolve(LOCALES_DIR, `${SOURCE_LOCALE}.json`))))
    const files = readdirSync(LOCALES_DIR)
      .filter((f) => f.endsWith('.json'))
      .sort()

    expect(files).toContain(`${SOURCE_LOCALE}.json`)

    const problems: string[] = []
    for (const file of files) {
      if (file === `${SOURCE_LOCALE}.json`) continue
      const localeKeys = new Set(flattenKeys(readJson(resolve(LOCALES_DIR, file))))
      for (const key of enKeys) {
        if (!localeKeys.has(key)) problems.push(`${file} is missing key '${key}'`)
      }
      for (const key of localeKeys) {
        if (!enKeys.has(key)) problems.push(`${file} has extra key '${key}' (not in en.json)`)
      }
    }
    expect(problems).toEqual([])
  })

  it('every static t()/tc()/$t() usage in app and server exists in en', () => {
    const enKeys = new Set(flattenKeys(readJson(resolve(LOCALES_DIR, `${SOURCE_LOCALE}.json`))))
    const files = [...collectSourceFiles(resolve(ROOT, 'app')), ...collectSourceFiles(resolve(ROOT, 'server'))].sort()

    expect(files.length).toBeGreaterThan(0)

    const problems: string[] = []
    for (const file of files) {
      const source = readFileSync(file, 'utf8')
      for (const key of extractStaticKeys(source)) {
        if (!enKeys.has(key)) {
          problems.push(`${file.replace(`${ROOT}\\`, '').replace(`${ROOT}/`, '')} uses missing key '${key}'`)
        }
      }
    }
    expect(problems).toEqual([])
  })
})
