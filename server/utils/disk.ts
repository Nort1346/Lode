import fs from 'node:fs'
import { settings } from '#server/database/schema'
import { eq } from 'drizzle-orm'
import type { DiskStatus } from '#server/types/disk'
import { formatSize } from '#server/utils/format'

export function checkDiskSpace(path: string, minFreeGb: number): DiskStatus {
  try {
    const stats = fs.statfsSync(path)
    const totalBytes = stats.blocks * stats.bsize
    const freeBytes = stats.bavail * stats.bsize
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

export function checkAllDisks(disks: string[], minFreeGb: number): DiskStatus[] {
  return disks
    .map((d) => d.trim())
    .filter((d) => d.length > 0)
    .map((d) => checkDiskSpace(d, minFreeGb))
}

export function findTargetDisk(disks: string[], targetPath: string, minFreeGb: number): DiskStatus | null {
  const trimmed = disks.map((d) => d.trim()).filter((d) => d.length > 0)
  for (const disk of trimmed) {
    if (targetPath.startsWith(disk)) {
      return checkDiskSpace(disk, minFreeGb)
    }
  }
  return null
}

export function isDiskCheckEnabled(): boolean {
  const db = useDb()
  const row = db.select().from(settings).where(eq(settings.key, 'disk_check_enabled')).get()
  if (row?.value === 'true') return true
  if (row?.value === 'false') return false
  return useRuntimeConfig().diskSpaceCheckEnabled as boolean
}

export function getDiskMinFreeGb(): number {
  const db = useDb()
  const row = db.select().from(settings).where(eq(settings.key, 'disk_min_free_gb')).get()
  if (row?.value !== undefined) {
    const parsed = Number(row.value)
    if (!Number.isNaN(parsed) && parsed >= 0) return parsed
  }
  return useRuntimeConfig().minFreeSpaceGb as number
}
