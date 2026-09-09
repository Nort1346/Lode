import { describe, it, expect } from 'vitest'
import { swarmSeedCount } from '#server/utils/torrents/swarm'

describe('swarmSeedCount', () => {
  it('preserves the unknown state (-1) when seeds are unknown and no completes', () => {
    expect(swarmSeedCount({ num_seeds: -1, num_complete: 0 })).toBe(-1)
  })

  it('falls back to the complete count when seeds are unknown', () => {
    expect(swarmSeedCount({ num_seeds: -1, num_complete: 7 })).toBe(7)
  })

  it('uses the seed count when it exceeds completes', () => {
    expect(swarmSeedCount({ num_seeds: 10, num_complete: 3 })).toBe(10)
  })

  it('uses the complete count when it exceeds seeds', () => {
    expect(swarmSeedCount({ num_seeds: 2, num_complete: 9 })).toBe(9)
  })

  it('ignores a negative complete count when seeds are known', () => {
    expect(swarmSeedCount({ num_seeds: 5, num_complete: -1 })).toBe(5)
  })
})
