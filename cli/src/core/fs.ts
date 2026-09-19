import { renameSync, writeFileSync } from 'node:fs'

// Temp file + rename so an interrupted run never leaves a partial file behind.
export function writeAtomic(filePath: string, content: string): void {
  const tmp = `${filePath}.tmp`
  writeFileSync(tmp, content, 'utf8')
  renameSync(tmp, filePath)
}
