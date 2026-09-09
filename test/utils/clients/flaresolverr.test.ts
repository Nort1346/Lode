import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { FlareSolverrClient, useFlareSolverr } from '#server/utils/clients/flaresolverr'

const mockFetch = vi.fn()

function jsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body)
  } as unknown as Response
}

describe('FlareSolverrClient', () => {
  let client: FlareSolverrClient

  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch)
    mockFetch.mockReset()
    client = new FlareSolverrClient('http://flare/')
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('solves a challenge and joins the cookies with semicolons', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse(200, {
        status: 'ok',
        solution: {
          url: 'https://target',
          status: 200,
          cookies: [
            { name: 'a', value: '1' },
            { name: 'b', value: '2' }
          ],
          userAgent: 'UA'
        }
      })
    )

    const result = await client.solveChallenge('https://target')

    expect(result).toEqual({ cookies: 'a=1; b=2', userAgent: 'UA' })
    expect(mockFetch).toHaveBeenCalledWith('http://flare/v1', expect.objectContaining({ method: 'POST' }))
  })

  it('throws a connection error when the fetch fails', async () => {
    mockFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'))

    await expect(client.solveChallenge('https://target')).rejects.toThrow('FlareSolverr connection failed')
  })

  it('throws an HTTP error for a non-ok response', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500, text: async () => 'boom' } as unknown as Response)

    await expect(client.solveChallenge('https://target')).rejects.toThrow('FlareSolverr HTTP 500')
  })

  it('throws when the solver returns a non-ok status', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(200, { status: 'error', message: 'nope' }))

    await expect(client.solveChallenge('https://target')).rejects.toThrow('FlareSolverr failed: error')
  })

  it('strips trailing slashes before probing isAlive', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200 } as unknown as Response)

    await expect(client.isAlive()).resolves.toBe(true)
    expect(mockFetch).toHaveBeenCalledWith('http://flare', expect.anything())
  })

  it('isAlive returns false when the request throws', async () => {
    mockFetch.mockRejectedValueOnce(new Error('down'))

    await expect(client.isAlive()).resolves.toBe(false)
  })
})

describe('useFlareSolverr', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns null when the url is not configured', () => {
    vi.stubGlobal(
      'useRuntimeConfig',
      vi.fn(() => ({ flaresolverrUrl: '' }))
    )

    expect(useFlareSolverr()).toBeNull()
  })

  it('returns a client when configured', () => {
    vi.stubGlobal(
      'useRuntimeConfig',
      vi.fn(() => ({ flaresolverrUrl: 'http://flare' }))
    )

    expect(useFlareSolverr()).toBeInstanceOf(FlareSolverrClient)
  })
})
