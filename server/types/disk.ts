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
