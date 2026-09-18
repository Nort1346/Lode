import { describe, expect, it } from 'vitest'
import { composeFilesFor, infraServicesFor } from '../src/constants'
import { DEFAULT_SELECTION } from '../src/core/state'
import type { SetupSelection } from '../src/types'

describe('composeFilesFor', () => {
  it('returns only the base file when everything is external or off', () => {
    const selection: SetupSelection = {
      ...DEFAULT_SELECTION,
      dbDriver: 'sqlite',
      qbittorrent: 'external',
      prowlarr: 'external',
      mediaMode: 'none'
    }
    expect(composeFilesFor(selection)).toEqual(['docker-compose.yml'])
  })

  it('returns all overlay files for a full-stack selection', () => {
    const selection: SetupSelection = {
      ...DEFAULT_SELECTION,
      dbDriver: 'postgres',
      flaresolverr: true,
      dozzle: true
    }
    expect(composeFilesFor(selection)).toEqual([
      'docker-compose.yml',
      'docker-compose.postgres.yml',
      'docker-compose.qbittorrent.yml',
      'docker-compose.prowlarr.yml',
      'docker-compose.jellyfin.yml',
      'docker-compose.flaresolverr.yml',
      'docker-compose.dozzle.yml'
    ])
  })
})

describe('infraServicesFor', () => {
  it('always includes redis', () => {
    expect(infraServicesFor(DEFAULT_SELECTION)[0]).toBe('redis')
  })

  it('includes every locally selected service', () => {
    const selection: SetupSelection = {
      ...DEFAULT_SELECTION,
      dbDriver: 'postgres',
      flaresolverr: true,
      dozzle: true
    }
    expect(infraServicesFor(selection)).toEqual([
      'redis',
      'postgres',
      'qbittorrent',
      'prowlarr',
      'jellyfin',
      'flaresolverr',
      'dozzle'
    ])
  })
})
