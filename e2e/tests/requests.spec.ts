import { expect, test } from '@playwright/test'
import { gotoPage, login, loginAdmin } from '../helpers.ts'
import { MOVIE_ID, MOVIE_TITLE, REGULAR_USER } from '../credentials.ts'

// The request lifecycle spans two roles: the user submits, the admin decides.
// Tests share the isolated database, so they must run in order.
test.describe.configure({ mode: 'serial' })

test.describe('request lifecycle', () => {
  test('user submits a request and sees the pending state', async ({ page }) => {
    await login(page, REGULAR_USER)
    await gotoPage(page, `/browse/movie/${MOVIE_ID}`)
    await expect(page.getByRole('heading', { name: MOVIE_TITLE })).toBeVisible()

    // If a previous attempt in this run already created the request, the
    // button is replaced by a status badge - assert that instead.
    const requestButton = page.getByRole('button', { name: 'Request this title' })
    if (await requestButton.isVisible()) {
      await requestButton.click()

      const dialog = page.getByRole('dialog')
      await expect(dialog).toBeVisible()
      await dialog.getByLabel('Message to admin (optional)').fill('Please add this one!')
      await dialog.getByRole('button', { name: 'Request this title' }).click()

      // exact: true avoids the duplicate screen-reader announcement node.
      await expect(page.getByText('Request sent', { exact: true })).toBeVisible()
    }

    // The button is replaced by the pending badge.
    await expect(page.getByText('Pending').first()).toBeVisible()
    await expect(requestButton).toHaveCount(0)
  })

  test('admin sees the pending request and accepts it', async ({ page }) => {
    await loginAdmin(page)
    await gotoPage(page, '/admin/requests')

    const row = page.getByRole('row').filter({ hasText: MOVIE_TITLE })
    await expect(row).toBeVisible()
    await expect(row.getByText('Pending')).toBeVisible()

    await row.getByRole('button', { name: 'Accept' }).click()

    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await dialog.getByRole('button', { name: 'Accept' }).click()

    await expect(page.getByRole('row').filter({ hasText: MOVIE_TITLE }).getByText('Accepted')).toBeVisible()
  })

  test('user sees the accepted state on the movie page', async ({ page }) => {
    await login(page, REGULAR_USER)
    await gotoPage(page, `/browse/movie/${MOVIE_ID}`)

    await expect(page.getByRole('heading', { name: MOVIE_TITLE })).toBeVisible()
    await expect(page.getByText('Accepted').first()).toBeVisible()
    await expect(page.getByRole('button', { name: 'Request this title' })).toHaveCount(0)
  })
})
