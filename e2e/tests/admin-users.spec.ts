import { expect, test, type Page } from '@playwright/test'
import { gotoPage, login, loginAdmin, createUserViaUi } from '../helpers.ts'
import { REGULAR_USER } from '../credentials.ts'

const NEW_USER = { username: 'e2e-newuser', password: 'LodeE2eNewUser!123' }
const DEACTIVATED_USER = { username: 'e2e-deactivated', password: 'LodeE2eDeact!123' }

// Tests share the isolated database and build on each other, so they run in
// declaration order.
test.describe.configure({ mode: 'serial' })

async function gotoUsers(page: Page): Promise<void> {
  await gotoPage(page, '/admin/users')
  await expect(page.getByRole('button', { name: 'Add User' })).toBeVisible()
}

test.describe('admin user management', () => {
  test('admin can create a user who can then sign in', async ({ page, browser }) => {
    await loginAdmin(page)
    await gotoUsers(page)

    // The seeded regular user is listed.
    await expect(page.getByRole('row').filter({ hasText: REGULAR_USER.username })).toBeVisible()

    await createUserViaUi(page, NEW_USER.username, NEW_USER.password)
    await expect(page.getByRole('row').filter({ hasText: NEW_USER.username })).toBeVisible()

    // The brand-new user can sign in with the password the admin set. This
    // needs a FRESH browser context: a new page in the admin's context would
    // inherit the admin session cookie and /login would bounce to /dashboard.
    const userContext = await browser.newContext()
    const userPage = await userContext.newPage()
    await login(userPage, NEW_USER)
    await expect(userPage.getByText('Welcome back,')).toBeVisible()
    await userContext.close()
  })

  test('a deactivated user cannot sign in', async ({ page, browser }) => {
    await loginAdmin(page)
    await gotoUsers(page)

    await createUserViaUi(page, DEACTIVATED_USER.username, DEACTIVATED_USER.password)
    const row = page.getByRole('row').filter({ hasText: DEACTIVATED_USER.username })
    await expect(row).toBeVisible()

    // The status dot (first button in the row) deactivates the user after
    // confirming the warning dialog.
    await row.getByRole('button').first().click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await dialog.getByRole('button', { name: 'Confirm' }).click()
    await expect(dialog).toBeHidden()

    // Signing in now fails with the deactivated message. Fresh context for
    // the same reason as above (no inherited admin session).
    const userContext = await browser.newContext()
    const userPage = await userContext.newPage()
    await gotoPage(userPage, '/login')
    await userPage.getByLabel('Username').fill(DEACTIVATED_USER.username)
    await userPage.getByLabel('Password').fill(DEACTIVATED_USER.password)
    await userPage.getByRole('button', { name: 'Sign In' }).click()

    await expect(userPage.getByText('Account is deactivated')).toBeVisible()
    expect(userPage.url()).toContain('/login')
    await userContext.close()
  })

  test('duplicate usernames are rejected when creating a user', async ({ page }) => {
    await loginAdmin(page)
    await gotoUsers(page)

    await createUserViaUi(page, NEW_USER.username, 'LodeE2eDupUser!123')

    // The modal stays open and shows the conflict error.
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await expect(dialog.getByText('Username already exists')).toBeVisible()
  })
})
