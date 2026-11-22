import { expect, test } from '@playwright/test'

test.describe('smoke', () => {
  test('login page renders for anonymous visitors', async ({ page }) => {
    const response = await page.goto('/login')
    expect(response).not.toBeNull()
    expect(response?.status()).toBe(200)

    await expect(page.getByRole('heading', { name: 'Lode' })).toBeVisible()
    await expect(page.getByText('Access your downloading panel')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Sign In' })).toBeVisible()
  })

  test('root redirects to the login page when logged out', async ({ page }) => {
    await page.goto('/')
    await page.waitForURL('**/login')
  })
})
