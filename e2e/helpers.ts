// Shared helpers for the E2E specs. All tests are browser-only: the app is
// driven through its UI against the real (isolated) server.
//
// IMPORTANT: the suite runs against the Nuxt DEV server, which compiles page
// modules on demand. A freshly loaded page is server-rendered but not yet
// hydrated for a while, and interacting with an unhydrated Vue app falls back
// to native browser behavior (e.g. clicking a form's submit button does a
// full-page reload instead of running the submit handler). Every navigation
// that is followed by interaction must wait for hydration first (gotoPage).

import { expect, type Page } from '@playwright/test'
import { ADMIN_USER, REGULAR_USER } from './credentials.ts'

export interface LoginCredentials {
  username: string
  password: string
}

// Waits until Vue has hydrated the app (the __vue_app__ instance is attached
// to the #__nuxt root element). Resolves immediately if already hydrated.
export async function waitUntilHydrated(page: Page): Promise<void> {
  await page.waitForFunction(
    () => {
      const root = document.getElementById('__nuxt')
      return root !== null && (root as { __vue_app__?: unknown }).__vue_app__ !== undefined
    },
    undefined,
    { timeout: 90_000 }
  )
}

// Navigates to `url` and waits until the page is safe to interact with.
export async function gotoPage(page: Page, url: string): Promise<void> {
  await page.goto(url)
  await waitUntilHydrated(page)
}

export async function login(page: Page, user: LoginCredentials = REGULAR_USER): Promise<void> {
  await gotoPage(page, '/login')
  await page.getByLabel('Username').fill(user.username)
  await page.getByLabel('Password').fill(user.password)
  await page.getByRole('button', { name: 'Sign In' }).click()
  await page.waitForURL('**/dashboard')
  // The dashboard must be hydrated before its (client-side) buttons work.
  await waitUntilHydrated(page)
}

export async function loginAdmin(page: Page): Promise<void> {
  await login(page, ADMIN_USER)
}

// Opens the "Create User" modal on /admin/users, fills it and submits.
// Expects the page to already be authenticated as an admin, hydrated, and on
// /admin/users. The caller asserts the outcome (modal closes on success,
// error alert on failure).
export async function createUserViaUi(page: Page, username: string, password: string): Promise<void> {
  await page.getByRole('button', { name: 'Add User' }).click()

  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await dialog.getByLabel('Username').fill(username)
  await dialog.getByLabel('Password').fill(password)
  await dialog.getByRole('button', { name: 'Create User' }).click()
}
