import { describe, it, expect } from 'vitest'
import { buildWatchTargets, detectWatchPlatform, rankWatchTargets, resolveWatchUrl } from '#shared/watch'

describe('buildWatchTargets', () => {
  const source = {
    jellyfin: {
      itemId: 'abc-123',
      serverId: 'server-1',
      userId: 'user-1',
      externalUrl: 'https://jellyfin.example.com/'
    }
  }

  it('builds Jellyfin web and native player links that open the item page', () => {
    const targets = buildWatchTargets(source)
    const byId = Object.fromEntries(targets.map((target) => [target.id, target]))

    expect(byId.moonfin?.url).toBe('moonfin://item?id=abc-123')
    expect(byId.findroid?.url).toBe('jellyfin://item/abc-123')
    expect(byId.swiftfin?.url).toBe('jellyfin://server-1/user-1/item/abc-123')
    expect(byId['jellyfin-web']?.url).toBe(
      'https://jellyfin.example.com/web/index.html#!/details?id=abc-123&context=home&serverId=server-1'
    )
  })

  it('omits Swiftfin without a server/user id and web links without an external URL', () => {
    const targets = buildWatchTargets({ jellyfin: { itemId: 'abc-123' } })
    expect(targets.map((target) => target.id)).toEqual(['moonfin', 'findroid'])
  })

  it('builds platform-specific Plex and Emby item links', () => {
    const targets = buildWatchTargets({
      plex: { machineId: 'machine-1', ratingKey: '42', mediaType: 'movie' },
      emby: { serverId: 'server-2', itemId: '77', externalUrl: 'https://emby.example.com' }
    })
    const byId = Object.fromEntries(targets.map((target) => [target.id, target]))

    expect(byId.plex?.urls?.ios).toBe('plex://preplay/?metadataKey=%2Flibrary%2Fmetadata%2F42&server=machine-1')
    expect(byId.plex?.urls?.android).toBe('plex://libraries/machine-1/unmatched/%2Flibrary%2Fmetadata%2F42')
    expect(byId['plex-web']?.url).toBe(
      'https://app.plex.tv/desktop#!/server/machine-1/details?key=%2Flibrary%2Fmetadata%2F42'
    )
    expect(byId.emby?.urls?.android).toBe('emby://items/server-2/77')
    expect(byId.emby?.urls?.ios).toBe('emby://items?serverId=server-2&itemId=77')
    expect(byId['emby-web']?.url).toBe('https://emby.example.com/web/index.html#!/item?id=77&serverId=server-2')
  })

  it('uses the tv path for Plex series deep links', () => {
    const [plex] = buildWatchTargets({
      plex: { machineId: 'machine-1', ratingKey: '42', mediaType: 'tv' }
    })
    expect(plex?.urls?.android).toContain('/unmatched/tv/')
  })
})

describe('detectWatchPlatform', () => {
  it('detects desktop and mobile platforms', () => {
    expect(detectWatchPlatform('Mozilla/5.0 (Linux; Android 14)')).toBe('android')
    expect(detectWatchPlatform('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0)')).toBe('ios')
    expect(detectWatchPlatform('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', true)).toBe('ios')
    expect(detectWatchPlatform('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)')).toBe('macos')
    expect(detectWatchPlatform('Mozilla/5.0 (Windows NT 10.0; Win64; x64)')).toBe('windows')
    expect(detectWatchPlatform('Mozilla/5.0 (X11; Linux x86_64)')).toBe('linux')
    expect(detectWatchPlatform('some-other-agent')).toBe('other')
  })
})

describe('rankWatchTargets', () => {
  const targets = buildWatchTargets({
    jellyfin: {
      itemId: 'abc',
      serverId: 's1',
      userId: 'u1',
      externalUrl: 'https://jf.example.com'
    },
    emby: { serverId: 's2', itemId: 'i2', externalUrl: 'https://emby.example.com' }
  })

  it('puts native apps before web clients', () => {
    const ranked = rankWatchTargets(targets, 'android')
    expect(ranked[0]?.id).toBe('moonfin')
    expect(ranked.filter((target) => target.kind === 'native').length).toBe(
      targets.filter((target) => target.kind === 'native').length
    )
    expect(ranked.at(-1)?.kind).toBe('web')
  })

  it('prioritises Swiftfin on iOS and Findroid on Android', () => {
    expect(rankWatchTargets(targets, 'ios')[1]?.id).toBe('swiftfin')
    expect(rankWatchTargets(targets, 'android')[1]?.id).toBe('findroid')
  })

  it('resolves platform-specific URLs with a universal fallback', () => {
    const emby = targets.find((target) => target.id === 'emby')
    expect(emby && resolveWatchUrl(emby, 'ios')).toBe('emby://items?serverId=s2&itemId=i2')
    expect(emby && resolveWatchUrl(emby, 'windows')).toBeNull()
    const moonfin = targets.find((target) => target.id === 'moonfin')
    expect(moonfin && resolveWatchUrl(moonfin, 'windows')).toBe('moonfin://item?id=abc')
  })
})
