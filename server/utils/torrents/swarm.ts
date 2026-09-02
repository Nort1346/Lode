import type { QBitTorrent } from '#server/types/torrent'

// qBittorrent reports -1 for num_seeds/num_complete until the first announce
// completes. Preserve that unknown state (-1) so the UI can distinguish
// "seed count not known yet" from a confirmed zero-seeder swarm.
export function swarmSeedCount(t: Pick<QBitTorrent, 'num_seeds' | 'num_complete'>): number {
  if (t.num_seeds < 0) return t.num_complete > 0 ? t.num_complete : -1
  return Math.max(t.num_seeds, t.num_complete > 0 ? t.num_complete : 0)
}
