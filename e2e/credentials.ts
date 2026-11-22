// Shared E2E credentials and fixture IDs.
//
// seed.ts inserts these users into the isolated E2E database before the
// server starts; the browser tests log in with them.

export interface E2EUser {
  username: string
  password: string
  role: 'user' | 'admin'
  dailyDownloadLimit: number
  activeTorrentLimit: number
  maxTorrentSizeGb: number
}

export const ADMIN_USER: E2EUser = {
  username: 'e2e-admin',
  password: 'LodeE2eAdmin!123',
  role: 'admin',
  dailyDownloadLimit: 999,
  activeTorrentLimit: 999,
  maxTorrentSizeGb: 999
}

export const REGULAR_USER: E2EUser = {
  username: 'e2e-user',
  password: 'LodeE2eUser!123',
  role: 'user',
  dailyDownloadLimit: 5,
  activeTorrentLimit: 3,
  maxTorrentSizeGb: 20
}

export const E2E_USERS: E2EUser[] = [ADMIN_USER, REGULAR_USER]

// Fixture media served by the mock TMDB (see e2e/mock-tmdb.ts)
export const MOVIE_ID = 603
export const MOVIE_TITLE = 'E2E Test Movie'
export const MOVIE_OVERVIEW = 'A deterministic movie for end-to-end tests.'
export const SECOND_MOVIE_ID = 604
export const SECOND_MOVIE_TITLE = 'E2E Second Movie'
export const TV_ID = 703
export const TV_TITLE = 'E2E Test Show'
