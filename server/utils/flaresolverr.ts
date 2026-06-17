export interface FlareSolverrSolution {
  cookies: string
  userAgent: string
}

export class FlareSolverrClient {
  private baseUrl: string

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/+$/, '')
  }

  async solveChallenge(url: string, maxTimeout = 60_000): Promise<FlareSolverrSolution> {
    const response = await fetch(`${this.baseUrl}/v1`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cmd: 'request.get',
        url,
        maxTimeout
      }),
      signal: AbortSignal.timeout(maxTimeout + 10_000)
    })

    if (!response.ok) {
      throw new Error(`FlareSolverr HTTP ${response.status}`)
    }

    const data = (await response.json()) as {
      status: string
      solution?: {
        cookies: Array<{ name: string; value: string }>
        userAgent: string
      }
    }

    if (data.status !== 'ok' || data.solution === undefined) {
      throw new Error(`FlareSolverr failed: ${data.status}`)
    }

    const cookieString = data.solution.cookies.map((c) => `${c.name}=${c.value}`).join('; ')

    return {
      cookies: cookieString,
      userAgent: data.solution.userAgent
    }
  }

  async isAlive(): Promise<boolean> {
    try {
      const res = await fetch(this.baseUrl, { signal: AbortSignal.timeout(5000) })
      return res.ok
    } catch {
      return false
    }
  }
}

let _client: FlareSolverrClient | null = null

export function useFlareSolverr(): FlareSolverrClient | null {
  const config = useRuntimeConfig()
  const url = config.flaresolverrUrl as string
  if (!url) return null

  if (_client === null) {
    _client = new FlareSolverrClient(url)
  }
  return _client
}
