import { gotScraping } from 'got-scraping'
import { createLogger } from '#server/utils/logger'

const log = createLogger('TrackerAuth')

interface DetectedForm {
  action: string
  usernameField: string
  passwordField: string
  hiddenFields: Record<string, string>
}

interface SessionCacheEntry {
  cookie: string
  expiresAt: number
}

const SESSION_CACHE_TTL = 60 * 60 * 1000
const sessionCache = new Map<string, SessionCacheEntry>()

export function clearSessionCache(loginUrl: string, username: string): void {
  const cacheKey = `${loginUrl}:${username}`
  sessionCache.delete(cacheKey)
  log.info(`[TrackerAuth] Cache evicted for ${loginUrl}:${username}`)
}

function parseCookies(setCookieHeaders: string[] | undefined): string {
  if (setCookieHeaders === undefined || setCookieHeaders.length === 0) return ''
  const cookies: string[] = []
  for (const header of setCookieHeaders) {
    const nameValue = header.split(';')[0]
    if (nameValue !== undefined && nameValue.length > 0) cookies.push(nameValue.trim())
  }
  return cookies.join('; ')
}

function detectFormFields(html: string, baseUrl: string): DetectedForm | null {
  const formMatch = html.match(/<form[^>]*>/gi)
  if (formMatch === null) return null

  let loginForm: string | null = null
  for (const form of formMatch) {
    const lower = form.toLowerCase()
    if (
      lower.includes('login') ||
      lower.includes('takelogin') ||
      lower.includes('log_in') ||
      lower.includes('signin') ||
      lower.includes('auth')
    ) {
      loginForm = form
      break
    }
  }

  if (loginForm === null) {
    loginForm = formMatch[0] ?? null
  }
  if (loginForm === null) return null

  const actionMatch = loginForm.match(/action=["']([^"']+)["']/i)
  let action = baseUrl
  if (actionMatch !== null && actionMatch[1] !== undefined) {
    const actionValue = actionMatch[1]
    if (!actionValue.startsWith('http')) {
      try {
        const base = new URL(baseUrl)
        action = `${base.origin}/${actionValue.replace(/^\//, '')}`
      } catch {
        action = `${baseUrl}/${actionValue.replace(/^\//, '')}`
      }
    } else {
      action = actionValue
    }
  }

  const passwordMatch = html.match(/<input[^>]*type=["']password["'][^>]*name=["']([^"']+)["']/i)
  const passwordField = passwordMatch?.[1] ?? 'password'

  const textInputs = [...html.matchAll(/<input[^>]*type=["'](text|email)["'][^>]*name=["']([^"']+)["']/gi)]
  let usernameField = 'username'
  const firstText = textInputs[0]
  if (firstText !== undefined && firstText[2] !== undefined) {
    usernameField = firstText[2]
  }

  const hiddenInputs = [
    ...html.matchAll(/<input[^>]*type=["']hidden["'][^>]*name=["']([^"']+)["'][^>]*value=["']([^"']*)["']/gi)
  ]
  const hiddenFields: Record<string, string> = {}
  for (const match of hiddenInputs) {
    if (match[1] !== undefined && match[2] !== undefined) {
      hiddenFields[match[1]] = match[2]
    }
  }

  log.info(
    `[TrackerAuth] Detected form: action="${action}" username="${usernameField}" password="${passwordField}" hidden=${Object.keys(hiddenFields).join(',')}`
  )
  return { action, usernameField, passwordField, hiddenFields }
}

export async function performTrackerLogin(loginUrl: string, username: string, password: string): Promise<string> {
  const cacheKey = `${loginUrl}:${username}`
  const cached = sessionCache.get(cacheKey)
  if (cached !== undefined && cached.expiresAt > Date.now()) {
    log.info(`[TrackerAuth] Using cached session for ${loginUrl}`)
    return cached.cookie
  }

  log.info(`[TrackerAuth] Fetching login page: ${loginUrl}`)
  const initResponse = await gotScraping({
    url: loginUrl,
    timeout: { request: 15_000 },
    responseType: 'text'
  })

  const initCookies = parseCookies(initResponse.headers['set-cookie'] as string[] | undefined)
  log.info(
    `[TrackerAuth] Login page returned HTTP ${initResponse.statusCode}, init cookies: ${initCookies.substring(0, 80)}...`
  )

  const form = detectFormFields(initResponse.body, loginUrl)
  if (form === null) {
    throw new Error('Could not detect login form on the page')
  }

  const formBody: Record<string, string> = { ...form.hiddenFields }
  formBody[form.usernameField] = username
  formBody[form.passwordField] = password

  log.info(`[TrackerAuth] POSTing to ${form.action} with fields: ${Object.keys(formBody).join(', ')}`)

  let referer: string
  try {
    referer = loginUrl
  } catch {
    referer = loginUrl
  }

  const loginResponse = await gotScraping({
    url: form.action,
    method: 'POST',
    form: formBody,
    headers: {
      Cookie: initCookies,
      Referer: referer,
      Origin: (() => {
        try {
          return new URL(loginUrl).origin
        } catch {
          return loginUrl
        }
      })(),
      'sec-fetch-dest': 'document',
      'sec-fetch-mode': 'navigate',
      'sec-fetch-site': 'same-origin',
      'sec-fetch-user': '?1',
      'upgrade-insecure-requests': '1'
    },
    timeout: { request: 15_000 },
    responseType: 'text',
    followRedirect: false
  })

  log.info(`[TrackerAuth] Login POST returned HTTP ${loginResponse.statusCode}`)

  const loginCookies = parseCookies(loginResponse.headers['set-cookie'] as string[] | undefined)

  const locationHeader = (() => {
    const loc = loginResponse.headers.location
    if (Array.isArray(loc)) {
      const first: unknown = loc[0]
      return typeof first === 'string' ? first : undefined
    }
    if (typeof loc === 'string') return loc
    return undefined
  })()

  if (loginResponse.statusCode === 302 && locationHeader !== undefined) {
    log.info(`[TrackerAuth] Redirected to: ${locationHeader}`)

    let redirectUrl = locationHeader
    if (!locationHeader.startsWith('http')) {
      try {
        const base = new URL(loginUrl)
        redirectUrl = `${base.origin}/${locationHeader.replace(/^\//, '')}`
      } catch {
        redirectUrl = `${loginUrl}/${locationHeader.replace(/^\//, '')}`
      }
    }

    const postCookies = initCookies.length > 0 ? `${initCookies}; ${loginCookies}` : loginCookies
    const redirectResponse = await gotScraping({
      url: redirectUrl,
      headers: {
        Cookie: postCookies,
        Referer: form.action,
        'sec-fetch-dest': 'document',
        'sec-fetch-mode': 'navigate',
        'sec-fetch-site': 'same-origin'
      },
      timeout: { request: 15_000 },
      responseType: 'text',
      followRedirect: true
    })
    const redirectCookies = parseCookies(redirectResponse.headers['set-cookie'] as string[] | undefined)
    log.info(
      `[TrackerAuth] Redirect fetch HTTP ${redirectResponse.statusCode}, redirect cookies: ${redirectCookies.substring(0, 80)}...`
    )
    const allCookies =
      postCookies.length > 0 && redirectCookies.length > 0
        ? `${postCookies}; ${redirectCookies}`
        : postCookies.length > 0
          ? postCookies
          : redirectCookies

    if (allCookies.length === 0) {
      const preview = loginResponse.body.substring(0, 200)
      log.error(`[TrackerAuth] No cookies received. Response preview: ${preview}`)
      throw new Error('Login failed - no session cookies received')
    }

    log.info(`[TrackerAuth] Login OK - cookies: ${allCookies.substring(0, 80)}...`)
    sessionCache.set(cacheKey, { cookie: allCookies, expiresAt: Date.now() + SESSION_CACHE_TTL })

    return allCookies
  }

  const allCookies = initCookies.length > 0 ? `${initCookies}; ${loginCookies}` : loginCookies

  if (allCookies.length === 0) {
    const preview = loginResponse.body.substring(0, 200)
    log.error(`[TrackerAuth] No cookies received. Response preview: ${preview}`)
    throw new Error('Login failed - no session cookies received')
  }

  if (loginResponse.statusCode === 200 && loginResponse.body.includes('Logowanie')) {
    log.error(`[TrackerAuth] Login page returned again - credentials may be wrong`)
    throw new Error('Login failed - still on login page (wrong credentials?)')
  }

  log.info(`[TrackerAuth] Login OK - cookies: ${allCookies.substring(0, 80)}...`)
  sessionCache.set(cacheKey, { cookie: allCookies, expiresAt: Date.now() + SESSION_CACHE_TTL })

  return allCookies
}
