import type { TorrentQuality } from '~/types/downloads'

export function formatEta(seconds: number): string {
  if (seconds <= 0) return '--'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

export function formatSpeed(bytesPerSec: number): string {
  if (bytesPerSec <= 0) return '0 B/s'
  const units = ['B/s', 'KB/s', 'MB/s', 'GB/s']
  let idx = 0
  let speed = bytesPerSec
  while (speed >= 1024 && idx < units.length - 1) {
    speed /= 1024
    idx++
  }
  return `${speed.toFixed(1)} ${units[idx]}`
}

export function formatSize(bytes: number): string {
  if (bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let idx = 0
  let size = bytes
  while (size >= 1024 && idx < units.length - 1) {
    size /= 1024
    idx++
  }
  return `${size.toFixed(idx >= 2 ? 2 : 1)} ${units[idx]}`
}

export function formatDate(dateStr: string): string {
  if (!dateStr) return '-'
  const d = new Date(dateStr)
  return d.toLocaleDateString('pl-PL', { year: 'numeric', month: '2-digit', day: '2-digit' })
}

export function getTorrentQuality(dl: { numSeeds: number; downloadSpeed: number }): TorrentQuality {
  const seeds = dl.numSeeds
  const speed = dl.downloadSpeed

  if (speed > 0 && seeds > 0) return 'ok'
  if (speed > 0 && seeds === 0) return 'slow'
  if (seeds <= 0) return 'dead'
  if (seeds < 5) return 'poor'
  if (seeds < 20) return 'slow'
  return 'ok'
}

export function useQualityConfig() {
  const { t } = useI18n()

  const qualityConfig = computed(() => ({
    dead: {
      border: 'border-red-500/50',
      badge: 'bg-red-500/20 text-red-400',
      badgeText: t('dashboard.dead'),
      bar: 'bg-red-500'
    },
    poor: {
      border: 'border-orange-500/50',
      badge: 'bg-orange-500/20 text-orange-400',
      badgeText: t('dashboard.poor'),
      bar: 'bg-orange-500'
    },
    slow: {
      border: 'border-yellow-500/50',
      badge: 'bg-yellow-500/20 text-yellow-400',
      badgeText: t('dashboard.slow'),
      bar: 'bg-yellow-500'
    },
    ok: {
      border: 'border-green-500/50',
      badge: 'bg-green-500/20 text-green-400',
      badgeText: t('dashboard.good'),
      bar: 'bg-green-500'
    }
  }))

  return { qualityConfig }
}
