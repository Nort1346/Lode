import { expect, test } from '@playwright/test'
import { gotoPage, login } from '../helpers.ts'
import { MOVIE_ID, MOVIE_OVERVIEW, MOVIE_TITLE, REGULAR_USER, SECOND_MOVIE_TITLE, TV_TITLE } from '../credentials.ts'

test.describe('browse', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, REGULAR_USER)
  })

  test('shows the trending and popular rows served by TMDB', async ({ page }) => {
    await gotoPage(page, '/browse')

    // The trending carousel is rendered first from the mock fixtures.
    await expect(page.getByText(MOVIE_TITLE).first()).toBeVisible({ timeout: 30_000 })
    await expect(page.getByText(TV_TITLE).first()).toBeVisible()
  })

  test('search filters the results by title', async ({ page }) => {
    await gotoPage(page, '/browse')

    // Wait for the idle carousels to load, then run a search.
    await expect(page.getByText(MOVIE_TITLE).first()).toBeVisible({ timeout: 30_000 })

    const search = page.getByPlaceholder('Search movies and TV shows...')
    await search.fill('E2E Second')

    // Only the "E2E Second ..." fixtures match.
    await expect(page.getByText(SECOND_MOVIE_TITLE).first()).toBeVisible()
    await expect(page.getByText(MOVIE_TITLE)).toHaveCount(0)
  })

  test('opens the movie detail page with the movie metadata', async ({ page }) => {
    await gotoPage(page, `/browse/movie/${MOVIE_ID}`)

    await expect(page.getByRole('heading', { name: MOVIE_TITLE })).toBeVisible()
    await expect(page.getByText(MOVIE_OVERVIEW)).toBeVisible()
  })

  test('opens the TV show detail page with the show metadata', async ({ page }) => {
    await gotoPage(page, `/browse/tv/703`)

    await expect(page.getByRole('heading', { name: TV_TITLE })).toBeVisible()
  })

  test('shows Prowlarr releases that cannot be mapped to a TMDB episode yet', async ({ page }) => {
    const payload = {
      show: { id: 703, name: TV_TITLE },
      season: { seasonNumber: 1, name: 'Season 1', overview: '', posterUrl: null, airDate: null },
      episodes: [],
      seasonPacks: [],
      otherTorrents: [
        {
          title: 'E2E.New.Episode.2026.1080p.WEB-DL',
          size: 1000,
          sizeFormatted: '1000 B',
          seeders: 5,
          leechers: 0,
          indexer: 'TestIndexer',
          magnetLink: 'magnet:?xt=urn:btih:e2e',
          downloadUrl: null,
          guid: null,
          score: 80,
          percentage: 80,
          recommended: false,
          resolution: '1080p',
          source: 'WEB',
          language: null,
          tags: [],
          isPrivate: false
        }
      ]
    }
    await page.route('**/api/browse/tv/**/torrents-stream*', async (route) => {
      await route.fulfill({
        status: 200,
        headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' },
        body:
          `data: ${JSON.stringify({ type: 'start', queries: 1 })}\n\n` +
          `data: ${JSON.stringify({ type: 'done', found: 1, data: payload })}\n\n`
      })
    })

    await gotoPage(page, `/browse/tv/703`)

    await expect(page.getByText('Other releases')).toBeVisible()
    await expect(page.getByText('E2E.New.Episode.2026.1080p.WEB-DL')).toBeVisible()
  })
})
