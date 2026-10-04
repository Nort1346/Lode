import { DEFAULT_TIMEZONE, ENV_FILE, ENV_KEYS } from '../constants'
import { readEnvValue, updateEnv } from '../core/env'
import { askConfirm, askSelect, askText, log, stepHeader } from '../core/prompt'
import { detectSystemTimezone, isValidTimezone } from '../core/timezone'

function saveTimezone(dir: string, value: string): void {
  updateEnv(dir, ENV_FILE, ENV_KEYS.timezone, value)
  log.success(`Timezone: ${value}`)
}

async function askManualTimezone(dir: string, initial: string): Promise<void> {
  for (;;) {
    const entered = (await askText('Enter timezone (IANA, e.g. Europe/Warsaw, empty = UTC)', initial)).trim()
    if (entered === '') {
      saveTimezone(dir, DEFAULT_TIMEZONE)
      return
    }
    if (isValidTimezone(entered)) {
      saveTimezone(dir, entered)
      return
    }
    log.warn(`"${entered}" is not a valid IANA timezone - try e.g. Europe/Warsaw`)
  }
}

export async function chooseTimezone(): Promise<void> {
  stepHeader(6, 'Timezone')
  const dir = process.cwd()
  const existing = readEnvValue(dir, ENV_FILE, ENV_KEYS.timezone).trim()
  const existingValid = existing !== '' && isValidTimezone(existing)
  const detected = detectSystemTimezone()

  if (existing !== '' && !existingValid) log.warn(`Existing TZ value "${existing}" is not a valid IANA timezone`)
  if (existingValid && (detected === null || existing === detected)) {
    log.success(`Timezone: ${existing} (already set)`)
    return
  }
  if (existingValid && detected !== null) {
    const choice = await askSelect<'existing' | 'detected' | 'manual'>(
      `Timezone in .env is "${existing}", detected "${detected}". Which to use?`,
      [
        { value: 'detected', label: `Use detected (${detected})`, hint: 'Recommended' },
        { value: 'existing', label: `Keep existing (${existing})` },
        { value: 'manual', label: 'Enter manually', hint: 'IANA name, e.g. Europe/Warsaw' }
      ],
      'detected'
    )
    if (choice === 'detected') {
      saveTimezone(dir, detected)
      return
    }
    if (choice === 'existing') {
      log.success(`Timezone: ${existing} (kept)`)
      return
    }
    await askManualTimezone(dir, existing)
    return
  }
  if (detected !== null) {
    if (await askConfirm(`Detected timezone "${detected}". Use it?`, true)) {
      saveTimezone(dir, detected)
      return
    }
    await askManualTimezone(dir, DEFAULT_TIMEZONE)
    return
  }
  log.warn('Could not detect system timezone')
  await askManualTimezone(dir, DEFAULT_TIMEZONE)
}
