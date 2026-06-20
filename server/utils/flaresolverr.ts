import { createLogger } from '#server/utils/logger'

const log = createLogger('FlareSolverr')

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
    log.info(`→ POST ${this.baseUrl}/v1`)
    log.info(`  target=${url}, maxTimeout=${maxTimeout}`)

    const start = Date.now()
    let response: Response
    try {
      response = await fetch(`${this.baseUrl}/v1`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cmd: 'request.get',
          url,
          maxTimeout
        }),
        signal: AbortSignal.timeout(maxTimeout + 10_000)
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      log.error(`✗ fetch failed after ${Date.now() - start}ms: ${msg}`)
      throw new Error(`FlareSolverr connection failed: ${msg}`, { cause: err })
    }

    log.info(`← HTTP ${response.status} (${Date.now() - start}ms)`)

    if (!response.ok) {
      const text = await response.text().catch(() => 'unable to read body')
      log.error(`✗ HTTP ${response.status}: ${text.substring(0, 200)}`)
      throw new Error(`FlareSolverr HTTP ${response.status}: ${text.substring(0, 100)}`)
    }

    const data = (await response.json()) as {
      status: string
      message?: string
      solution?: {
        url: string
        status: number
        cookies: Array<{ name: string; value: string }>
        userAgent: string
        response?: string
      }
    }

    log.info(`  status=${data.status}, message=${data.message ?? ''}`)
    if (data.solution !== undefined) {
      log.info(`  solution.url=${data.solution.url}`)
      log.info(`  solution.status=${data.solution.status}`)
      log.info(`  solution.cookies=${data.solution.cookies.length}`)
      log.info(`  solution.userAgent=${data.solution.userAgent.substring(0, 80)}`)
      if (data.solution.response !== undefined) {
        log.info(`  solution.response.length=${data.solution.response.length}`)
      }
    }

    if (data.status !== 'ok' || data.solution === undefined) {
      log.error(`✗ failed: status=${data.status}, message=${data.message ?? 'unknown'}`)
      throw new Error(`FlareSolverr failed: ${data.status} - ${data.message ?? 'unknown'}`)
    }

    const cookieString = data.solution.cookies.map((c) => `${c.name}=${c.value}`).join('; ')
    log.info(`✓ solved: ${data.solution.cookies.length} cookies, ready`)

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
  if (!url) {
    log.info('not configured (NUXT_FLARESOLVERR_URL is empty)')
    return null
  }

  log.info(`initialized: ${url}`)
  if (_client === null) {
    _client = new FlareSolverrClient(url)
  }
  return _client
}
