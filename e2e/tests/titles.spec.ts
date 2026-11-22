import { expect, test } from '@playwright/test'
import { gotoPage, login, loginAdmin } from '../helpers.ts'
import { MOVIE_ID, MOVIE_TITLE, REGULAR_USER, TV_ID, TV_TITLE } from '../credentials.ts'

test.describe('page titles', () => {
  test('login page uses the "Page | Lode" format', async ({ page }) => {
    await gotoPage(page, '/login')
    await expect.poll(() => page.title()).toBe('Sign In | Lode')
  })

  test('title follows client-side navigation and back/forward', async ({ page }) => {
    await login(page, REGULAR_USER)
    await expect.poll(() => page.title()).toBe('Dashboard | Lode')

    // Client-side navigation via the sidebar link (no full page reload).
    await page.locator('aside').getByRole('link', { name: 'Browse' }).click()
    await page.waitForURL('**/browse')
    await expect.poll(() => page.title()).toBe('Browse | Lode')

    // Browser back/forward must update the title as well.
    await page.goBack()
    await page.waitForURL('**/dashboard')
    await expect.poll(() => page.title()).toBe('Dashboard | Lode')

    await page.goForward()
    await page.waitForURL('**/browse')
    await expect.poll(() => page.title()).toBe('Browse | Lode')
  })

  test('detail pages use the loaded item name in the title', async ({ page }) => {
    await login(page, REGULAR_USER)

    await gotoPage(page, `/browse/movie/${MOVIE_ID}`)
    await expect(page.getByRole('heading', { name: MOVIE_TITLE })).toBeVisible()
    await expect.poll(() => page.title()).toBe(`${MOVIE_TITLE} | Lode`)

    await page.goBack()
    await page.waitForURL('**/dashboard')
    await expect.poll(() => page.title()).toBe('Dashboard | Lode')

    await gotoPage(page, `/browse/tv/${TV_ID}`)
    await expect(page.getByRole('heading', { name: TV_TITLE })).toBeVisible()
    await expect.poll(() => page.title()).toBe(`${TV_TITLE} | Lode`)
  })

  test('each user page sets its own title', async ({ page }) => {
    await login(page, REGULAR_USER)
    const cases: Array<[string, string]> = [
      ['/dashboard/downloads', 'My Downloads | Lode'],
      ['/dashboard/wishlist', 'My Wishlist | Lode'],
      ['/user', 'Profile | Lode']
    ]
    for (const [path, title] of cases) {
      await gotoPage(page, path)
      await expect.poll(() => page.title()).toBe(title)
    }
  })

  test('each admin page sets its own title', async ({ page }) => {
    await loginAdmin(page)
    const cases: Array<[string, string]> = [
      ['/admin/users', 'User Management | Lode'],
      ['/admin/requests', 'Requests | Lode'],
      ['/admin/trackers', 'Private Trackers | Lode'],
      ['/admin/ranking', 'Torrent Ranking | Lode'],
      ['/admin/sessions', 'Active Sessions | Lode'],
      ['/admin/logs', 'Activity Logs | Lode'],
      ['/admin/brute-force', 'Login Protection | Lode'],
      ['/admin/settings', 'Settings | Lode'],
      ['/dashboard/submit', 'Submit Torrent | Lode']
    ]
    for (const [path, title] of cases) {
      await gotoPage(page, path)
      await expect.poll(() => page.title()).toBe(title)
    }
  })
})
