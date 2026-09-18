import { unlink, writeFile } from 'node:fs/promises'
import { renameSync } from 'node:fs'

export class DownloadError extends Error {}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

// Downloads to a sibling temp file and renames into place, so an interrupted
// download never leaves a truncated file at the destination.
export async function downloadFile(url: string, dest: string): Promise<void> {
  const tmp = `${dest}.tmp`
  const response = await fetch(url).catch((error: unknown) => {
    throw new DownloadError(`Could not reach ${url}: ${errorMessage(error)}`)
  })
  try {
    if (!response.ok) throw new DownloadError(`Download failed (HTTP ${response.status}): ${url}`)
    const data = Buffer.from(await response.arrayBuffer())
    await writeFile(tmp, data)
    renameSync(tmp, dest)
  } catch (error) {
    await unlink(tmp).catch(() => {})
    if (error instanceof DownloadError) throw error
    throw new DownloadError(`Download failed: ${url} (${errorMessage(error)})`)
  }
}

export async function fetchText(url: string): Promise<string> {
  const response = await fetch(url).catch((error: unknown) => {
    throw new DownloadError(`Could not reach ${url}: ${errorMessage(error)}`)
  })
  if (!response.ok) throw new DownloadError(`HTTP ${response.status} for ${url}`)
  return response.text()
}
