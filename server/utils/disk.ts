import fs from 'node:fs'

export interface DiskStatus {
  path: string
  totalBytes: number
  freeBytes: number
  usedBytes: number
  totalFormatted: string
  freeFormatted: string
  usedFormatted: string
  usedPercent: number
  hasEnoughSpace: boolean
  available: boolean
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  const size = (bytes / Math.pow(1024, i)).toFixed(1)
  return `${size} ${units[i]}`
}

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
      totalFormatted: formatBytes(totalBytes),
      freeFormatted: formatBytes(freeBytes),
      usedFormatted: formatBytes(usedBytes),
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
