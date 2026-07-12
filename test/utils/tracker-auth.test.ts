import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGotScraping = vi.fn()

vi.mock('got-scraping', () => ({
  gotScraping: (...args: unknown[]) => mockGotScraping(...args)
}))

vi.mock('#server/utils/logger', () => ({
  createLogger: () => ({ info: vi.fn(), error: vi.fn() })
}))

describe('tracker-auth', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  async function loadTrackerAuth() {
    return await import('#server/utils/tracker-auth')
  }

  describe('clearSessionCache', () => {
    it('does not throw when clearing cache', async () => {
      const { clearSessionCache } = await loadTrackerAuth()
      expect(() => clearSessionCache('http://tracker.example.com/login', 'user1')).not.toThrow()
    })
  })

  describe('performTrackerLogin', () => {
    it('throws when no login form detected', async () => {
      mockGotScraping.mockResolvedValue({
        statusCode: 200,
        body: '<html><body>No form here</body></html>',
        headers: {}
      })

      const { performTrackerLogin } = await loadTrackerAuth()
      await expect(performTrackerLogin('http://tracker.example.com/login', 'user', 'pass')).rejects.toThrow(
        'Could not detect login form'
      )
    })

    it('detects form fields and submits login', async () => {
      mockGotScraping
        .mockResolvedValueOnce({
          statusCode: 200,
          body: `
            <form action="/takelogin" method="post">
              <input type="text" name="username" />
              <input type="password" name="password" />
              <input type="hidden" name="csrf" value="token123" />
            </form>
          `,
          headers: { 'set-cookie': ['session_id=abc123; Path=/'] }
        })
        .mockResolvedValueOnce({
          statusCode: 302,
          body: '',
          headers: { location: '/index', 'set-cookie': ['logged_in=yes; Path=/'] }
        })
        .mockResolvedValueOnce({
          statusCode: 200,
          body: '<html>Dashboard</html>',
          headers: { 'set-cookie': ['final_cookie=xyz; Path=/'] }
        })

      const { performTrackerLogin } = await loadTrackerAuth()
      const cookies = await performTrackerLogin('http://tracker.example.com/login', 'myuser', 'mypass')

      expect(cookies).toContain('session_id=abc123')
      expect(cookies).toContain('logged_in=yes')
      expect(cookies).toContain('final_cookie=xyz')
      expect(mockGotScraping).toHaveBeenCalledTimes(3)
    })

    it('throws when no cookies received', async () => {
      mockGotScraping.mockResolvedValue({
        statusCode: 200,
        body: `
          <form action="/login" method="post">
            <input type="text" name="user" />
            <input type="password" name="pass" />
          </form>
        `,
        headers: {}
      })

      const { performTrackerLogin } = await loadTrackerAuth()
      await expect(performTrackerLogin('http://tracker.example.com/login', 'user', 'pass')).rejects.toThrow(
        'Login failed'
      )
    })

    it('throws when still on login page after POST', async () => {
      mockGotScraping.mockResolvedValue({
        statusCode: 200,
        body: `
          <form action="/login" method="post">
            <input type="text" name="user" />
            <input type="password" name="pass" />
          </form>
          Logowanie
        `,
        headers: { 'set-cookie': ['session=abc; Path=/'] }
      })

      const { performTrackerLogin } = await loadTrackerAuth()
      await expect(performTrackerLogin('http://tracker.example.com/login', 'user', 'pass')).rejects.toThrow(
        'still on login page'
      )
    })

    it('uses cached session on repeat calls', async () => {
      mockGotScraping
        .mockResolvedValueOnce({
          statusCode: 200,
          body: `
            <form action="/login" method="post">
              <input type="text" name="user" />
              <input type="password" name="pass" />
            </form>
          `,
          headers: { 'set-cookie': ['session=first; Path=/'] }
        })
        .mockResolvedValueOnce({
          statusCode: 302,
          body: '',
          headers: { location: '/index', 'set-cookie': ['login=ok; Path=/'] }
        })
        .mockResolvedValueOnce({
          statusCode: 200,
          body: '<html>OK</html>',
          headers: {}
        })

      const { performTrackerLogin } = await loadTrackerAuth()

      const first = await performTrackerLogin('http://tracker.com/login', 'u', 'p')
      expect(first).toContain('session=first')

      const second = await performTrackerLogin('http://tracker.com/login', 'u', 'p')
      expect(second).toContain('session=first')
      expect(mockGotScraping).toHaveBeenCalledTimes(3)
    })

    it('handles relative redirect URLs', async () => {
      mockGotScraping
        .mockResolvedValueOnce({
          statusCode: 200,
          body: `
            <form action="/auth/login" method="post">
              <input type="text" name="username" />
              <input type="password" name="password" />
            </form>
          `,
          headers: { 'set-cookie': ['sid=abc; Path=/'] }
        })
        .mockResolvedValueOnce({
          statusCode: 302,
          body: '',
          headers: { location: '/dashboard', 'set-cookie': ['auth=ok; Path=/'] }
        })
        .mockResolvedValueOnce({
          statusCode: 200,
          body: '<html>Dashboard</html>',
          headers: {}
        })

      const { performTrackerLogin } = await loadTrackerAuth()
      const cookies = await performTrackerLogin('http://tracker.example.com/login', 'user', 'pass')
      expect(cookies).toContain('sid=abc')
    })

    it('detects password field name from HTML', async () => {
      mockGotScraping
        .mockResolvedValueOnce({
          statusCode: 200,
          body: `
            <form action="/login" method="post">
              <input type="text" name="login" />
              <input type="password" name="passwd" />
            </form>
          `,
          headers: { 'set-cookie': ['session=x; Path=/'] }
        })
        .mockResolvedValueOnce({
          statusCode: 200,
          body: 'success',
          headers: { 'set-cookie': ['auth=y; Path=/'] }
        })

      const { performTrackerLogin } = await loadTrackerAuth()
      const cookies = await performTrackerLogin('http://tracker.com/login', 'user', 'pass')
      expect(cookies).toContain('session=x')

      const postCall = mockGotScraping.mock.calls[1] as [Record<string, unknown>]
      expect(postCall[0].form).toHaveProperty('login', 'user')
      expect(postCall[0].form).toHaveProperty('passwd', 'pass')
    })
  })
})
