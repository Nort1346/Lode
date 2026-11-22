import { expect, test } from '@playwright/test'
import { gotoPage, login } from '../helpers.ts'
import { ADMIN_USER, REGULAR_USER } from '../credentials.ts'

test.describe('authentication', () => {
  test('signing in with a wrong password shows an error and stays on the login page', async ({ page }) => {
    await gotoPage(page, '/login')
    await page.getByLabel('Username').fill(ADMIN_USER.username)
    await page.getByLabel('Password').fill('definitely-wrong-password')
    await page.getByRole('button', { name: 'Sign In' }).click()

    await expect(page.getByText('Invalid credentials')).toBeVisible()
    expect(page.url()).toContain('/login')
  })

  test('signing in with valid credentials lands on the dashboard', async ({ page }) => {
    await login(page, ADMIN_USER)

    expect(page.url()).toContain('/dashboard')
    await expect(page.getByText('Welcome back,')).toBeVisible()
    // The mobile sidebar (div, lg:hidden) also contains the username, so
    // scope to the visible desktop <aside> to keep the locator strict.
    await expect(page.locator('aside').getByText(ADMIN_USER.username)).toBeVisible()
  })

  test('signing out returns to the login page', async ({ page }) => {
    await login(page, ADMIN_USER)
    // The mobile sidebar (lg:hidden) also renders a Sign Out button, so scope
    // to the visible desktop sidebar to keep the locator strict-mode safe.
    await page.locator('aside').getByRole('button', { name: 'Sign Out' }).click()

    await page.waitForURL('**/login')

    // The layout sidebar is gone after logout: no Sign Out button remains.
    await expect(page.getByRole('button', { name: 'Sign Out' })).toHaveCount(0)
  })

  test('anonymous visitors are redirected away from the dashboard', async ({ page }) => {
    await page.goto('/dashboard')
    await page.waitForURL('**/login')
  })

  test('anonymous visitors are redirected away from browse', async ({ page }) => {
    await page.goto('/browse')
    await page.waitForURL('**/login')
  })

  test('regular users are redirected away from admin pages', async ({ page }) => {
    await login(page, REGULAR_USER)
    await page.goto('/admin/users')

    await page.waitForURL('**/dashboard')
  })
})
