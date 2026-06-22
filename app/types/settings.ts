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

export interface ServiceStatus {
  name: string
  configured: boolean
  status: 'up' | 'down' | 'not_configured'
  latencyMs?: number
  details?: string
}
