import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { PlexPmsClient, PlexTvClient, checkPlexStatus, usePlex, extractTmdbId } from '#server/utils/clients/plex'

const mockFetch = vi.fn()

function okResponse(body: unknown = {}) {
  return {
    ok: true,
    status: 200,
    json: async () => body,
    text: async () => ''
  } as unknown as Response
}

function errorResponse(status: number, text: string) {
  return {
    ok: false,
    status,
    json: async () => ({}),
    text: async () => text
  } as unknown as Response
}

function stubConfig(url: string, token: string) {
  vi.stubGlobal(
    'useRuntimeConfig',
    vi.fn(() => ({ plexUrl: url, plexToken: token }))
  )
}

function pms() {
  return new PlexPmsClient('http://plex:32400', 'test-token')
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('fetch', mockFetch)
  mockFetch.mockReset()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('extractTmdbId', () => {
  it('parses a tmdb:// id out of the Guid array', () => {
    expect(extractTmdbId({ Guid: [{ id: 'tvdb://12' }, { id: 'tmdb://812' }] })).toBe(812)
  })

  it('is case-insensitive on the scheme', () => {
    expect(extractTmdbId({ Guid: [{ id: 'TMDB://42' }] })).toBe(42)
  })

  it('returns null when the Guid array is empty', () => {
    expect(extractTmdbId({ Guid: [] })).toBeNull()
  })

  it('returns null when Guid is absent', () => {
    expect(extractTmdbId({})).toBeNull()
  })

  it('returns null for a plex:// primary guid with no tmdb entry', () => {
    expect(extractTmdbId({ guid: 'plex://movie/abc' })).toBeNull()
  })

  it('falls back to a tmdb:// primary guid', () => {
    expect(extractTmdbId({ guid: 'tmdb://550' })).toBe(550)
  })

  it('ignores a non-numeric tmdb id', () => {
    expect(extractTmdbId({ Guid: [{ id: 'tmdb://abc' }] })).toBeNull()
  })

  it('prefers the Guid array over the primary guid', () => {
    expect(extractTmdbId({ guid: 'tmdb://1', Guid: [{ id: 'tmdb://99' }] })).toBe(99)
  })
})

describe('checkPlexStatus', () => {
  it('returns not_configured when url or token is missing', async () => {
    stubConfig('', '')
    await expect(checkPlexStatus()).resolves.toEqual({
      name: 'Plex',
      configured: false,
      status: 'not_configured'
    })
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('returns up with the version on success', async () => {
    stubConfig('http://plex:32400', 'tok')
    mockFetch.mockResolvedValueOnce(okResponse({ MediaContainer: { version: '1.43.3.10896', myPlexSigninState: 'ok' } }))

    await expect(checkPlexStatus()).resolves.toEqual({
      name: 'Plex',
      configured: true,
      status: 'up',
      latencyMs: expect.any(Number),
      details: '1.43.3.10896'
    })
    expect(mockFetch).toHaveBeenCalledWith(
      'http://plex:32400/',
      expect.objectContaining({
        headers: expect.objectContaining({ 'X-Plex-Token': 'tok', Accept: 'application/json' })
      })
    )
  })

  it('flags an unclaimed server in the details', async () => {
    stubConfig('http://plex:32400', 'tok')
    mockFetch.mockResolvedValueOnce(
      okResponse({ MediaContainer: { version: '1.43.3.10896', myPlexSigninState: 'signin' } })
    )

    await expect(checkPlexStatus()).resolves.toEqual(
      expect.objectContaining({ status: 'up', details: '1.43.3.10896 - server not claimed' })
    )
  })

  it('returns invalid when the token is rejected (401/403)', async () => {
    stubConfig('http://plex:32400', 'tok')
    mockFetch.mockResolvedValueOnce(errorResponse(401, 'Unauthorized'))

    await expect(checkPlexStatus()).resolves.toEqual(
      expect.objectContaining({ status: 'invalid', details: 'Token rejected' })
    )
  })

  it('returns invalid on 403', async () => {
    stubConfig('http://plex:32400', 'tok')
    mockFetch.mockResolvedValueOnce(errorResponse(403, 'Forbidden'))

    await expect(checkPlexStatus()).resolves.toEqual(expect.objectContaining({ status: 'invalid' }))
  })

  it('returns error with the HTTP status on other non-ok responses', async () => {
    stubConfig('http://plex:32400', 'tok')
    mockFetch.mockResolvedValueOnce(errorResponse(500, 'Boom'))

    await expect(checkPlexStatus()).resolves.toEqual(
      expect.objectContaining({ status: 'error', details: 'HTTP 500' })
    )
  })

  it('returns error for a malformed response body', async () => {
    stubConfig('http://plex:32400', 'tok')
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => {
        throw new Error('bad json')
      },
      text: async () => 'nope'
    } as unknown as Response)

    await expect(checkPlexStatus()).resolves.toEqual(
      expect.objectContaining({ status: 'error', details: 'Malformed response' })
    )
  })

  it('returns down when the request throws', async () => {
    stubConfig('http://plex:32400', 'tok')
    mockFetch.mockRejectedValueOnce(new Error('network down'))

    await expect(checkPlexStatus()).resolves.toEqual(expect.objectContaining({ status: 'down' }))
  })
})

describe('usePlex', () => {
  it('returns null when not configured', () => {
    stubConfig('', '')
    expect(usePlex()).toBeNull()
  })

  it('returns clients when configured', () => {
    stubConfig('http://plex:32400', 'tok')
    const clients = usePlex()
    expect(clients).not.toBeNull()
    expect(clients?.pms).toBeDefined()
    expect(clients?.tv).toBeDefined()
  })
})

describe('PlexPmsClient', () => {
  it('maps sections with their locations', async () => {
    mockFetch.mockResolvedValueOnce(
      okResponse({
        MediaContainer: {
          Directory: [
            { key: '1', type: 'movie', title: 'Movies', Location: [{ id: 1, path: '/media/Movies' }] },
            { key: '2', type: 'show', title: 'TV Shows', Location: [{ id: 2, path: '/media/TV' }] }
          ]
        }
      })
    )

    const sections = await pms().getSections()
    expect(sections).toEqual([
      { key: '1', type: 'movie', title: 'Movies', Location: [{ id: 1, path: '/media/Movies' }] },
      { key: '2', type: 'show', title: 'TV Shows', Location: [{ id: 2, path: '/media/TV' }] }
    ])
    expect(mockFetch).toHaveBeenCalledWith(
      'http://plex:32400/library/sections',
      expect.objectContaining({
        headers: expect.objectContaining({ Accept: 'application/json', 'X-Plex-Token': 'test-token' })
      })
    )
  })

  it('stops paginating on a short page', async () => {
    const small = Array.from({ length: 3 }, (_, i) => ({ type: 'movie', Guid: [{ id: `tmdb://${i}` }] }))
    mockFetch.mockResolvedValueOnce(okResponse({ MediaContainer: { size: 3, Metadata: small } }))

    const items = await pms().getLibraryItems('1', 1)
    expect(items).toHaveLength(3)
    expect(mockFetch).toHaveBeenCalledTimes(1)
    expect(mockFetch).toHaveBeenNthCalledWith(
      1,
      'http://plex:32400/library/sections/1/all?includeGuids=1&type=1',
      expect.objectContaining({
        headers: expect.objectContaining({ 'X-Plex-Container-Start': '0', 'X-Plex-Container-Size': '500' })
      })
    )
  })

  it('advances the container start and stops at totalSize', async () => {
    const full = Array.from({ length: 500 }, (_, i) => ({ type: 'movie', Guid: [{ id: `tmdb://${i}` }] }))
    const rest = Array.from({ length: 50 }, (_, i) => ({ type: 'movie', Guid: [{ id: `tmdb://${900 + i}` }] }))
    mockFetch
      .mockResolvedValueOnce(okResponse({ MediaContainer: { size: 500, totalSize: 550, Metadata: full } }))
      .mockResolvedValueOnce(okResponse({ MediaContainer: { size: 50, totalSize: 550, Metadata: rest } }))

    const items = await pms().getLibraryItems('1', 1)
    expect(items).toHaveLength(550)
    expect(mockFetch).toHaveBeenCalledTimes(2)
    expect(mockFetch).toHaveBeenNthCalledWith(
      2,
      'http://plex:32400/library/sections/1/all?includeGuids=1&type=1',
      expect.objectContaining({
        headers: expect.objectContaining({ 'X-Plex-Container-Start': '500' })
      })
    )
  })

  it('refreshes a single section', async () => {
    mockFetch.mockResolvedValueOnce(okResponse({}))
    await pms().refreshSection('1')
    expect(mockFetch).toHaveBeenCalledWith(
      'http://plex:32400/library/sections/1/refresh',
      expect.objectContaining({ method: 'POST' })
    )
  })

  it('refreshes all sections', async () => {
    mockFetch.mockResolvedValueOnce(okResponse({}))
    await pms().refreshAll()
    expect(mockFetch).toHaveBeenCalledWith(
      'http://plex:32400/library/sections/refresh',
      expect.objectContaining({ method: 'POST' })
    )
  })

  it('builds a create-section request from query parameters', async () => {
    mockFetch.mockResolvedValueOnce(okResponse({}))
    await pms().createSection({
      name: 'Movies',
      type: 1,
      agent: 'tv.plex.agents.movie',
      language: 'en',
      locations: ['/media/Movies']
    })
    expect(mockFetch).toHaveBeenCalledWith(
      'http://plex:32400/library/sections?name=Movies&type=1&agent=tv.plex.agents.movie&language=en&locations=%2Fmedia%2FMovies',
      expect.objectContaining({ method: 'POST' })
    )
  })
})

describe('PlexPmsClient.isItemInLibrary', () => {
  const sections = {
    MediaContainer: {
      Directory: [
        { key: '1', type: 'movie', title: 'Movies' },
        { key: '2', type: 'show', title: 'TV' },
        { key: '3', type: 'artist', title: 'Music' }
      ]
    }
  }

  function mockSectionsThenItems(movieGuid: string, showGuid: string) {
    mockFetch
      .mockResolvedValueOnce(okResponse(sections))
      .mockResolvedValueOnce(okResponse({ MediaContainer: { Metadata: [{ type: 'movie', Guid: [{ id: movieGuid }] }] } }))
      .mockResolvedValueOnce(okResponse({ MediaContainer: { Metadata: [{ type: 'show', Guid: [{ id: showGuid }] }] } }))
  }

  it('finds a tmdb id across movie and show sections (skips artist)', async () => {
    mockSectionsThenItems('tmdb://812', 'tmdb://1399')
    await expect(pms().isItemInLibrary(812)).resolves.toBe(true)
    // 1 sections call + 2 item fetches (artist section skipped)
    expect(mockFetch).toHaveBeenCalledTimes(3)
  })

  it('returns false when the id is not present', async () => {
    mockSectionsThenItems('tmdb://812', 'tmdb://1399')
    await expect(pms().isItemInLibrary(999)).resolves.toBe(false)
  })

  it('fails open to false when the fetch errors', async () => {
    mockFetch.mockRejectedValueOnce(new Error('down'))
    await expect(pms().isItemInLibrary(812)).resolves.toBe(false)
  })

  it('caches the tmdb set within the TTL', async () => {
    mockSectionsThenItems('tmdb://812', 'tmdb://1399')
    const client = pms()
    await client.isItemInLibrary(812)
    const afterFirst = mockFetch.mock.calls.length
    await client.isItemInLibrary(1399)
    expect(mockFetch.mock.calls.length).toBe(afterFirst)
  })

  it('re-fetches after invalidateLibraryCache', async () => {
    mockSectionsThenItems('tmdb://812', 'tmdb://1399')
    const client = pms()
    await client.isItemInLibrary(812)
    client.invalidateLibraryCache()
    const afterFirst = mockFetch.mock.calls.length
    await client.isItemInLibrary(812)
    expect(mockFetch.mock.calls.length).toBeGreaterThan(afterFirst)
  })

  it('dedupes concurrent fetches through the in-flight promise', async () => {
    const client = pms()
    let resolveSections: (r: Response) => void = () => {}
    const sectionsPromise = new Promise<Response>((res) => {
      resolveSections = res
    })
    mockFetch.mockReturnValueOnce(sectionsPromise)
    mockFetch.mockResolvedValue(okResponse({ MediaContainer: { Metadata: [{ type: 'movie', Guid: [{ id: 'tmdb://812' }] }] } }))

    const p1 = client.isItemInLibrary(812)
    const p2 = client.isItemInLibrary(1399)
    resolveSections(okResponse(sections))

    const [r1, r2] = await Promise.all([p1, p2])
    expect(r1).toBe(true)
    expect(r2).toBe(false)
    // One sections call + one item fetch per relevant section (movie + show),
    // all shared between both callers - no duplicate round-trips. Without the
    // in-flight dedupe the second caller would re-run the whole scan (6 calls).
    expect(mockFetch.mock.calls.length).toBe(3)
  })
})

describe('PlexTvClient', () => {
  it('parses a bare-array home-users response', async () => {
    mockFetch.mockResolvedValueOnce(okResponse([{ id: 1, title: 'Alice' }]))
    const users = await new PlexTvClient('tok').getHomeUsers()
    expect(users).toEqual([{ id: 1, title: 'Alice' }])
  })

  it('parses a { users: [...] } response', async () => {
    mockFetch.mockResolvedValueOnce(okResponse({ users: [{ id: 2, title: 'Bob' }] }))
    const users = await new PlexTvClient('tok').getHomeUsers()
    expect(users).toEqual([{ id: 2, title: 'Bob' }])
  })

  it('parses a { home: { users: [...] } } envelope', async () => {
    mockFetch.mockResolvedValueOnce(okResponse({ home: { users: [{ id: 3, title: 'Cara' }] } }))
    const users = await new PlexTvClient('tok').getHomeUsers()
    expect(users).toEqual([{ id: 3, title: 'Cara' }])
  })

  it('returns [] for an unrecognized shape', async () => {
    mockFetch.mockResolvedValueOnce(okResponse({ what: 'even is this' }))
    await expect(new PlexTvClient('tok').getHomeUsers()).resolves.toEqual([])
  })

  it('sends the token and client identifier to plex.tv', async () => {
    mockFetch.mockResolvedValueOnce(okResponse([]))
    await new PlexTvClient('tok').getHomeUsers()
    expect(mockFetch).toHaveBeenCalledWith(
      'https://plex.tv/api/v2/home/users',
      expect.objectContaining({
        headers: expect.objectContaining({
          'X-Plex-Token': 'tok',
          'X-Plex-Client-Identifier': 'lode-media-hub',
          Accept: 'application/json'
        })
      })
    )
  })

  it('creates a managed user and parses the id', async () => {
    mockFetch.mockResolvedValueOnce(okResponse({ user: { id: 42, title: 'Kid', restricted: 1 } }))
    const user = await new PlexTvClient('tok').createManagedUser({ title: 'Kid', allowSync: true, allowTuners: false })
    expect(user.id).toBe(42)
    expect(mockFetch).toHaveBeenCalledWith(
      'https://plex.tv/api/v2/home/users/restricted?friendlyName=Kid&sharingSettings%5BallowSync%5D=1&sharingSettings%5BallowTuners%5D=0',
      expect.objectContaining({ method: 'POST' })
    )
  })

  it('throws when the created managed user has no id', async () => {
    mockFetch.mockResolvedValueOnce(okResponse({ bogus: true }))
    await expect(new PlexTvClient('tok').createManagedUser({ title: 'X' })).rejects.toThrow(
      'could not parse the created managed user'
    )
  })

  it('posts shared_servers with 0/1 flags and the invited id', async () => {
    mockFetch.mockResolvedValueOnce(okResponse({}))
    await new PlexTvClient('tok').createShare('mid', 7, [1, 2], { allowSync: true, allowTuners: false })
    expect(mockFetch).toHaveBeenCalledWith(
      'https://plex.tv/api/v2/shared_servers',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          machineIdentifier: 'mid',
          librarySectionIds: [1, 2],
          settings: { allowSync: 1, allowTuners: 0 },
          invitedId: 7
        })
      })
    )
  })

  it('invites an existing account by email via the v1 endpoint', async () => {
    mockFetch.mockResolvedValueOnce(okResponse({}))
    await new PlexTvClient('tok').inviteExistingUser('a@example.com')
    expect(mockFetch).toHaveBeenCalledWith(
      'https://plex.tv/api/home/users?invitedEmail=a%40example.com',
      expect.objectContaining({ method: 'POST' })
    )
  })

  it('removes a share via /api/v2/sharings/{id}', async () => {
    mockFetch.mockResolvedValueOnce(okResponse({}))
    await new PlexTvClient('tok').removeShare(42)
    expect(mockFetch).toHaveBeenCalledWith(
      'https://plex.tv/api/v2/sharings/42',
      expect.objectContaining({ method: 'DELETE' })
    )
  })
})
