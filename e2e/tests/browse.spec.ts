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

  test('keeps loose Prowlarr movie matches in a separate section', async ({ page }) => {
    const torrent = (title: string) => ({
      title,
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
      source: 'WEB-DL',
      language: null,
      tags: [],
      isPrivate: false
    })
    await page.route('**/api/browse/movie/**/torrents-stream*', async (route) => {
      const data = {
        torrents: [torrent('E2E.The.Movie.2024.1080p.WEB-DL')],
        otherTorrents: [torrent('E2E.Similar.Title.Movie.1995.1080p')]
      }
      await route.fulfill({
        status: 200,
        headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' },
        body:
          `data: ${JSON.stringify({ type: 'start', queries: 2 })}\n\n` +
          `data: ${JSON.stringify({ type: 'done', found: 2, data })}\n\n`
      })
    })

    await gotoPage(page, `/browse/movie/${MOVIE_ID}`)

    await expect(page.getByText('E2E.The.Movie.2024.1080p.WEB-DL')).toBeVisible()
    const loose = page.locator('details', { hasText: 'Other results' })
    await expect(loose).toBeVisible()
    await loose.locator('summary').click()
    await expect(loose.getByText('E2E.Similar.Title.Movie.1995.1080p')).toBeVisible()
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

  test('collapses episode results below the match threshold', async ({ page }) => {
    const torrent = (title: string, percentage: number) => ({
      title,
      size: 1000,
      sizeFormatted: '1000 B',
      seeders: 5,
      leechers: 0,
      indexer: 'TestIndexer',
      magnetLink: 'magnet:?xt=urn:btih:e2e',
      downloadUrl: null,
      guid: null,
      score: percentage,
      percentage,
      recommended: false,
      resolution: '1080p',
      source: 'WEB-DL',
      language: null,
      tags: [],
      isPrivate: false
    })
    const payload = {
      show: { id: 703, name: TV_TITLE },
      season: { seasonNumber: 1, name: 'Season 1', overview: '', posterUrl: null, airDate: null },
      episodes: [
        {
          id: 1,
          episodeNumber: 1,
          name: 'Pilot',
          overview: '',
          stillUrl: null,
          airDate: '2026-01-01',
          rating: 0,
          runtime: null,
          torrents: [
            torrent('E2E.Show.S01E01.1080p', 80),
            torrent('E2E.Show.S01E01.720p', 25),
            torrent('E2E.Other.Show.S01E01.720p', 20)
          ]
        }
      ],
      seasonPacks: [],
      otherTorrents: []
    }
    await page.route('**/api/browse/tv/**/torrents-stream*', async (route) => {
      await route.fulfill({
        status: 200,
        headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' },
        body:
          `data: ${JSON.stringify({ type: 'start', queries: 1 })}\n\n` +
          `data: ${JSON.stringify({ type: 'done', found: 3, data: payload })}\n\n`
      })
    })

    await gotoPage(page, `/browse/tv/703`)

    await expect(page.getByText('E2E.Show.S01E01.1080p')).toBeVisible()
    await expect(page.getByText('E2E.Show.S01E01.720p')).toBeVisible()
    const more = page.locator('details', { hasText: 'More results' })
    await expect(more).toBeVisible()
    await expect(more.getByText('E2E.Other.Show.S01E01.720p')).toBeHidden()
    await more.locator('summary').click()
    await expect(more.getByText('E2E.Other.Show.S01E01.720p')).toBeVisible()
  })

  test('labels a pack that covers more than one season', async ({ page }) => {
    const payload = {
      show: { id: 703, name: TV_TITLE },
      season: { seasonNumber: 1, name: 'Season 1', overview: '', posterUrl: null, airDate: null },
      episodes: [],
      seasonPacks: [
        {
          title: 'E2E.Show.2022.Seasons.1.and.2.Complete.1080p.WEB.x264',
          size: 1000,
          sizeFormatted: '1000 B',
          seeders: 20,
          leechers: 0,
          indexer: 'TestIndexer',
          magnetLink: 'magnet:?xt=urn:btih:e2e',
          downloadUrl: null,
          guid: null,
          score: 90,
          percentage: 90,
          recommended: true,
          resolution: '1080p',
          source: 'WEB-DL',
          language: null,
          tags: [],
          isPrivate: false,
          isSeasonPack: true,
          seasons: [1, 2]
        }
      ],
      otherTorrents: []
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

    await expect(page.getByText('Seasons 1-2', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Add seasons 1-2' })).toBeVisible()

    // The same pack must also be usable from season 2's page.
    await page.getByText('Season 1 (2 ep.)').first().click()
    await page.getByRole('option', { name: /Season 2/ }).click()
    await expect(page.getByText('Seasons 1-2', { exact: true })).toBeVisible()
  })
})
