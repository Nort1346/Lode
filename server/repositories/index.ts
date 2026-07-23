import { useDbAsync } from '#server/utils/db'
import type { AppDb, SqliteDb } from '#server/types/database'
import { createUserRepo } from './users'
import { createDownloadRepo } from './downloads'
import { createSettingRepo } from './settings'
import { createSessionRepo } from './sessions'
import { createRequestRepo } from './requests'
import { createNotificationRepo } from './notifications'
import { createCustomTrackerRepo } from './custom-trackers'
import { createActivityLogRepo } from './activity-logs'
import { createLoginAttemptRepo } from './login-attempts'
import { createPushSubscriptionRepo } from './push-subscriptions'
import { createWishlistRepo } from './wishlist'
import { createSyncProviderRepo } from './sync-providers'
import { createSyncUserSettingsRepo } from './sync-user-settings'
import type { UserRepo } from './users'
import type { DownloadRepo } from './downloads'
import type { SettingRepo } from './settings'
import type { SessionRepo } from './sessions'
import type { RequestRepo } from './requests'
import type { NotificationRepo } from './notifications'
import type { CustomTrackerRepo } from './custom-trackers'
import type { ActivityLogRepo } from './activity-logs'
import type { LoginAttemptRepo } from './login-attempts'
import type { PushSubscriptionRepo } from './push-subscriptions'
import type { WishlistRepo } from './wishlist'
import type { SyncProviderRepo } from './sync-providers'
import type { SyncUserSettingsRepo } from './sync-user-settings'

export interface Repos {
  users: UserRepo
  downloads: DownloadRepo
  settings: SettingRepo
  sessions: SessionRepo
  requests: RequestRepo
  notifications: NotificationRepo
  customTrackers: CustomTrackerRepo
  activityLogs: ActivityLogRepo
  loginAttempts: LoginAttemptRepo
  pushSubscriptions: PushSubscriptionRepo
  wishlist: WishlistRepo
  syncProviders: SyncProviderRepo
  syncUserSettings: SyncUserSettingsRepo
}

let _repos: Repos | null = null

/**
 * Creates repository instances for the given database.
 * Both SQLite and PG share the same drizzle API surface (select/insert/update/delete)
 * and the helpers (dbGet/dbAll/dbRun) handle dialect differences at runtime.
 * The cast to SqliteDb is safe because the repos only use the shared API surface.
 */
export function getRepos(db: AppDb): Repos {
  if (_repos === null) {
    const typed = db as unknown as SqliteDb
    _repos = {
      users: createUserRepo(typed),
      downloads: createDownloadRepo(typed),
      settings: createSettingRepo(typed),
      sessions: createSessionRepo(typed),
      requests: createRequestRepo(typed),
      notifications: createNotificationRepo(typed),
      customTrackers: createCustomTrackerRepo(typed),
      activityLogs: createActivityLogRepo(typed),
      loginAttempts: createLoginAttemptRepo(typed),
      pushSubscriptions: createPushSubscriptionRepo(typed),
      wishlist: createWishlistRepo(typed),
      syncProviders: createSyncProviderRepo(typed),
      syncUserSettings: createSyncUserSettingsRepo(typed)
    }
  }
  return _repos
}

/**
 * Async convenience — gets or creates repos using the configured DB driver.
 * Handlers can simply: const repos = await getReposAsync()
 */
export async function getReposAsync(): Promise<Repos> {
  return getRepos(await useDbAsync())
}
