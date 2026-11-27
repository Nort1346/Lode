import { expect, test } from '@playwright/test'
import { gotoPage, login } from '../helpers.ts'
import { ADMIN_USER, REGULAR_USER } from '../credentials.ts'

test.describe('library', () => {
  test('anonymous visitors are redirected to login', async ({ page }) => {
    await page.goto('/library')
    await page.waitForURL('**/login')
  })

  test('is available to regular users', async ({ page }) => {
    await login(page, REGULAR_USER)
    await gotoPage(page, '/library')

    await expect(page.getByRole('heading', { name: 'Your library' })).toBeVisible()
    await expect(page.getByRole('tab', { name: /Movies/ })).toBeVisible()
    await expect(page.getByRole('tab', { name: /Series/ })).toBeVisible()
    // No media server is configured in the isolated E2E environment.
    await expect(page.getByText('No media server connected')).toBeVisible()
    await expect(page.getByRole('link', { name: 'Open settings' })).toHaveCount(0)
  })

  test('is available to admins', async ({ page }) => {
    await login(page, ADMIN_USER)
    await gotoPage(page, '/library')

    await expect(page.getByRole('heading', { name: 'Your library' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Open settings' })).toBeVisible()
  })
})
