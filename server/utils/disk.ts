import { exec } from 'node:child_process'
import { promisify } from 'node:util'
import { getReposAsync } from '#server/repositories'
import type { DiskStatus } from '#server/types/disk'
import { formatSize } from '#server/utils/format'

const execAsync = promisify(exec)

async function getDiskInfo(path: string): Promise<{ totalBytes: number; freeBytes: number } | null> {
  try {
    const { stdout } = await execAsync(`df -k "${path}"`)
    const lines = stdout.trim().split('\n')
    if (lines.length < 2) return null
    const parts = lines[1]?.trim().split(/\s+/) ?? []
    const totalKb = parseInt(parts[1] ?? '', 10)
    const availableKb = parseInt(parts[3] ?? '', 10)
    if (Number.isNaN(totalKb) || Number.isNaN(availableKb)) return null
    return {
      totalBytes: totalKb * 1024,
      freeBytes: availableKb * 1024
    }
  } catch {
    return null
  }
}

export async function checkDiskSpace(path: string, minFreeGb: number): Promise<DiskStatus> {
  try {
    const info = await getDiskInfo(path)
    if (!info) throw new Error('Failed to get disk info')

    const { totalBytes, freeBytes } = info
    const usedBytes = totalBytes - freeBytes
    const usedPercent = totalBytes > 0 ? Math.round((usedBytes / totalBytes) * 100) : 0
    const freeGb = freeBytes / 1024 ** 3

    return {
      path,
      totalBytes,
      freeBytes,
      usedBytes,
      totalFormatted: formatSize(totalBytes),
      freeFormatted: formatSize(freeBytes),
      usedFormatted: formatSize(usedBytes),
      usedPercent,
      hasEnoughSpace: freeGb >= minFreeGb,
      available: true
    }
  } catch {
    return {
      path,
      totalBytes: 0,
      freeBytes: 0,
      usedBytes: 0,
      totalFormatted: '-',
      freeFormatted: '-',
      usedFormatted: '-',
      usedPercent: 0,
      hasEnoughSpace: false,
      available: false
    }
  }
}

export async function checkAllDisks(disks: string[], minFreeGb: number): Promise<DiskStatus[]> {
  const results = await Promise.all(
    disks
      .map((d) => d.trim())
      .filter((d) => d.length > 0)
      .map((d) => checkDiskSpace(d, minFreeGb))
  )
  return results
}

export async function findTargetDisk(
  disks: string[],
  targetPath: string,
  minFreeGb: number
): Promise<DiskStatus | null> {
  const trimmed = disks.map((d) => d.trim()).filter((d) => d.length > 0)
  for (const disk of trimmed) {
    if (targetPath.startsWith(disk)) {
      return await checkDiskSpace(disk, minFreeGb)
    }
  }
  return null
}

export async function isDiskCheckEnabled(): Promise<boolean> {
  const repos = await getReposAsync()
  const value = await repos.settings.get('disk_check_enabled')
  if (value === 'true') return true
  if (value === 'false') return false
  return useRuntimeConfig().diskSpaceCheckEnabled as boolean
}

export async function getDiskMinFreeGb(): Promise<number> {
  const repos = await getReposAsync()
  const value = await repos.settings.get('disk_min_free_gb')
  if (value !== undefined) {
    const parsed = Number(value)
    if (!Number.isNaN(parsed) && parsed >= 0) return parsed
  }
  return useRuntimeConfig().minFreeSpaceGb as number
}
