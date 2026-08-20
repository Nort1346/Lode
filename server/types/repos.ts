import type {
  User,
  CreateUserInput,
  UpdateUserInput,
  Download,
  CreateDownloadInput,
  UpdateDownloadInput,
  Session,
  Request as DbRequest,
  Notification,
  CustomTracker,
  ActivityLog,
  LoginAttempt,
  WishlistItem,
  PushSubscription,
  SyncProvider,
  SyncUserSettings
} from '#server/types/entities'

export interface UserRepo {
  findById(id: string): Promise<User | undefined>
  findByUsername(username: string): Promise<User | undefined>
  findByRole(role: 'admin' | 'user'): Promise<User[]>
  findAll(): Promise<User[]>
  findExpiredUsers(now: string): Promise<{ id: string; username: string }[]>
  create(data: CreateUserInput): Promise<void>
  update(id: string, data: UpdateUserInput): Promise<void>
  delete(id: string): Promise<void>
}

export interface DownloadRepo {
  findById(id: string): Promise<Download | undefined>
  findActiveByUser(userId: string): Promise<Download[]>
  findActiveDownloads(): Promise<Download[]>
  findCompletedDownloads(): Promise<Download[]>
  findByUser(userId: string): Promise<Download[]>
  findPaginated(
    filters: { userId?: string; status?: Download['status'] },
    page: number,
    limit: number
  ): Promise<Download[]>
  countFiltered(filters: { userId?: string; status?: Download['status'] }): Promise<number>
  countByUserSince(userId: string, sinceIso: string, excludeStatuses: Download['status'][]): Promise<number>
  create(data: CreateDownloadInput): Promise<void>
  update(id: string, data: UpdateDownloadInput): Promise<void>
}

export interface SettingRepo {
  get(key: string): Promise<string | undefined>
  set(key: string, value: string): Promise<void>
  delete(key: string): Promise<void>
}

export interface SessionRepo {
  findById(id: string): Promise<Session | undefined>
  findUserSessions(userId: string): Promise<Pick<Session, 'id' | 'createdAt'>[]>
  create(data: Session): Promise<void>
  touch(id: string, now: string): Promise<void>
  delete(id: string): Promise<void>
  deleteByUser(userId: string): Promise<void>
}

export interface RequestRepo {
  findById(id: string): Promise<DbRequest | undefined>
  findByUser(userId: string): Promise<DbRequest[]>
  findDuplicate(userId: string, mediaType: 'movie' | 'tv', mediaId: number): Promise<DbRequest | undefined>
  findPaginated(status?: 'pending' | 'accepted' | 'rejected'): Promise<DbRequest[]>
  create(data: Omit<DbRequest, 'status' | 'adminNote' | 'updatedAt'>): Promise<void>
  updateStatus(id: string, status: 'accepted' | 'rejected', adminNote: string | null, updatedAt: string): Promise<void>
}

export interface NotificationRepo {
  findExistingUnread(userId: string, type: string): Promise<{ id: string } | undefined>
  findByUser(userId: string, limit: number): Promise<Notification[]>
  countUnread(userId: string): Promise<number>
  create(data: Omit<Notification, 'read'>): Promise<void>
  updateExisting(id: string, title: string, message: string, createdAt: string): Promise<void>
  markRead(id: string, userId: string): Promise<{ changes: number }>
  markAllRead(userId: string): Promise<{ changes: number }>
}

export interface CustomTrackerRepo {
  findById(id: string): Promise<CustomTracker | undefined>
  findByIndexerName(name: string): Promise<CustomTracker | undefined>
  findAll(): Promise<CustomTracker[]>
  findEnabled(): Promise<CustomTracker[]>
  checkNameUnique(name: string, excludeId: string): Promise<boolean>
  create(data: Omit<CustomTracker, 'enabled'> & { enabled?: boolean }): Promise<void>
  update(id: string, data: Partial<Omit<CustomTracker, 'id'>>): Promise<void>
  delete(id: string): Promise<void>
}

export interface ActivityLogRepo {
  countFiltered(filters: { userId?: string; action?: string }): Promise<number>
  findPaginated(filters: { userId?: string; action?: string }, page: number, limit: number): Promise<ActivityLog[]>
  create(data: Omit<ActivityLog, 'id'> & { id?: string }): Promise<void>
  deleteOlderThan(cutoff: string): Promise<void>
}

export interface LoginAttemptRepo {
  countFailedInWindow(ip: string, windowStart: string): Promise<number>
  countByStatus(success: boolean, since: string): Promise<number>
  countTotal(since: string): Promise<number>
  create(data: Omit<LoginAttempt, 'id'> & { id?: string }): Promise<void>
  deleteFailedByIp(ip: string): Promise<void>
  deleteOlderThan(cutoff: string): Promise<void>
}

export interface PushSubscriptionRepo {
  findByUser(userId: string): Promise<PushSubscription[]>
  findByEndpoint(endpoint: string): Promise<PushSubscription | undefined>
  create(data: Omit<PushSubscription, 'lastUsedAt'>): Promise<void>
  delete(id: string): Promise<void>
}

export interface WishlistRepo {
  findByUser(userId: string): Promise<WishlistItem[]>
  findDuplicate(userId: string, mediaType: 'movie' | 'tv', mediaId: number): Promise<WishlistItem | undefined>
  create(data: WishlistItem): Promise<void>
  delete(id: string): Promise<void>
}

export interface SyncProviderRepo {
  findUserProvider(userId: string, providerName: string): Promise<SyncProvider | undefined>
  findByUser(userId: string): Promise<SyncProvider[]>
  create(data: Omit<SyncProvider, 'lastSyncError'>): Promise<void>
  updateStatus(
    userId: string,
    providerName: string,
    status: 'synced' | 'pending' | 'failed',
    error?: string
  ): Promise<void>
  deleteByUser(userId: string): Promise<void>
}

export interface SyncUserSettingsRepo {
  find(userId: string, providerName: string): Promise<SyncUserSettings | undefined>
  upsert(
    userId: string,
    providerName: string,
    settings: Omit<SyncUserSettings, 'id' | 'userId' | 'providerName' | 'createdAt' | 'updatedAt'>
  ): Promise<void>
  deleteByUser(userId: string): Promise<void>
}

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
