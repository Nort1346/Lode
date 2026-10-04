export function isValidTimezone(value: string): boolean {
  if (value.trim() === '') return false
  try {
    new Intl.DateTimeFormat(undefined, { timeZone: value })
    return true
  } catch {
    return false
  }
}

export function detectSystemTimezone(): string | null {
  try {
    const detected = Intl.DateTimeFormat().resolvedOptions().timeZone
    if (typeof detected === 'string' && detected !== '' && isValidTimezone(detected)) return detected
    return null
  } catch {
    return null
  }
}
