import { ENV_FILE, ENV_KEYS, PASSWORD_LENGTH, SECRET_MIN_LENGTH, TRACKER_KEY_BYTES } from '../constants'
import { envValueMeetsMinLength, updateEnv } from '../core/env'
import { log, stepHeader } from '../core/prompt'
import { generateHexKey, generatePassword } from '../core/secrets'

export function generateSecrets(): void {
  stepHeader(4, 'Generating secrets')
  const dir = process.cwd()
  if (envValueMeetsMinLength(dir, ENV_FILE, ENV_KEYS.sessionPassword, SECRET_MIN_LENGTH)) {
    log.success('Session password already set - keeping it')
  } else {
    updateEnv(dir, ENV_FILE, ENV_KEYS.sessionPassword, generatePassword(PASSWORD_LENGTH))
    log.success('Session password generated')
  }
  if (envValueMeetsMinLength(dir, ENV_FILE, ENV_KEYS.trackerEncryptionKey, SECRET_MIN_LENGTH)) {
    log.success('Tracker encryption key already set - keeping it')
  } else {
    updateEnv(dir, ENV_FILE, ENV_KEYS.trackerEncryptionKey, generateHexKey(TRACKER_KEY_BYTES))
    log.success('Tracker encryption key generated')
  }
}
