import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { writeAtomic } from './fs'

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function envFilePath(dir: string, file: string): string {
  return path.join(dir, file)
}

export function readEnvValue(dir: string, file: string, key: string): string {
  if (!existsSync(envFilePath(dir, file))) return ''
  const lines = readFileSync(envFilePath(dir, file), 'utf8').split('\n')
  const pattern = new RegExp(`^${escapeRegExp(key)}=`)
  for (const line of lines) {
    if (pattern.test(line)) return line.slice(line.indexOf('=') + 1)
  }
  return ''
}

export function envValueMeetsMinLength(dir: string, file: string, key: string, min: number): boolean {
  const value = readEnvValue(dir, file, key)
  return value.length >= min
}

// Replace an active KEY= line, else uncomment a "# KEY=" line, else append.
// String-based (not sed-style) so values containing & or $ survive intact.
export function updateEnvFile(content: string, key: string, value: string): string {
  const lines = content.split('\n')
  const escapedKey = escapeRegExp(key)
  const activeIndex = lines.findIndex((line) => new RegExp(`^${escapedKey}=`).test(line))
  if (activeIndex !== -1) {
    lines[activeIndex] = `${key}=${value}`
    return lines.join('\n')
  }
  const commentedIndex = lines.findIndex((line) => new RegExp(`^#\\s*${escapedKey}=`).test(line))
  if (commentedIndex !== -1) {
    lines[commentedIndex] = `${key}=${value}`
    return lines.join('\n')
  }
  return `${content.replace(/\s+$/, '')}\n${key}=${value}\n`
}

export function updateEnv(dir: string, file: string, key: string, value: string): void {
  const filePath = envFilePath(dir, file)
  if (!existsSync(filePath)) return
  writeAtomic(filePath, updateEnvFile(readFileSync(filePath, 'utf8'), key, value))
}
