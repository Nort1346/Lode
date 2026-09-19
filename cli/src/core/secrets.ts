import { randomBytes } from 'node:crypto'
import { PASSWORD_LENGTH, TRACKER_KEY_BYTES } from '../constants'

const ALPHANUMERIC = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'

export function generatePassword(length: number = PASSWORD_LENGTH): string {
  const bytes = randomBytes(length)
  let password = ''
  for (const byte of bytes) password += ALPHANUMERIC.charAt(byte % ALPHANUMERIC.length)
  return password
}

export function generateHexKey(byteLength: number = TRACKER_KEY_BYTES): string {
  return randomBytes(byteLength).toString('hex')
}
