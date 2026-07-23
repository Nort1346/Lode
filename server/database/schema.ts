import type * as sqliteSchema from './schema.sqlite'
import * as pgSchema from './schema.pg'
import * as sqliteSchemaRuntime from './schema.sqlite'

const driver = process.env.DB_DRIVER ?? 'sqlite'
const schema = driver === 'postgres' ? pgSchema : sqliteSchemaRuntime

/**
 * Runtime schema resolver — exports the correct schema (PG or SQLite) based on DB_DRIVER.
 * Type-level: cast to SQLite schema for TypeScript compatibility. Both schemas define
 * identical table names and column names. The actual PG/SQLite type mapping is handled
 * by the db instance at runtime (created with the correct schema via drivers/).
 */
export const users = schema.users as unknown as (typeof sqliteSchema)['users']
export const downloads = schema.downloads as unknown as (typeof sqliteSchema)['downloads']
export const settings = schema.settings as unknown as (typeof sqliteSchema)['settings']
export const activityLogs = schema.activityLogs as unknown as (typeof sqliteSchema)['activityLogs']
export const requests = schema.requests as unknown as (typeof sqliteSchema)['requests']
export const customTrackers = schema.customTrackers as unknown as (typeof sqliteSchema)['customTrackers']
export const loginAttempts = schema.loginAttempts as unknown as (typeof sqliteSchema)['loginAttempts']
export const sessions = schema.sessions as unknown as (typeof sqliteSchema)['sessions']
export const wishlist = schema.wishlist as unknown as (typeof sqliteSchema)['wishlist']
export const notifications = schema.notifications as unknown as (typeof sqliteSchema)['notifications']
export const pushSubscriptions = schema.pushSubscriptions as unknown as (typeof sqliteSchema)['pushSubscriptions']
export const syncProviders = schema.syncProviders as unknown as (typeof sqliteSchema)['syncProviders']
export const syncUserSettings = schema.syncUserSettings as unknown as (typeof sqliteSchema)['syncUserSettings']
