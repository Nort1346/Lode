import { settings } from '#server/database/schema'
import { eq } from 'drizzle-orm'
import { useDbAsync, dbGet, dbRun } from '#server/utils/db'
import type { SettingKey } from '#server/types/settings'

export async function getSetting(key: SettingKey): Promise<string | undefined> {
  const db = await useDbAsync()
  const row = await dbGet(db.select({ value: settings.value }).from(settings).where(eq(settings.key, key)))
  return row?.value
}

export async function putSetting(key: SettingKey, value: string): Promise<void> {
  const db = await useDbAsync()
  const existing = await dbGet(db.select({ key: settings.key }).from(settings).where(eq(settings.key, key)))
  if (existing !== undefined) {
    await dbRun(db.update(settings).set({ value }).where(eq(settings.key, key)))
  } else {
    await dbRun(db.insert(settings).values({ key, value }))
  }
}

export async function deleteSetting(key: SettingKey): Promise<void> {
  const db = await useDbAsync()
  await dbRun(db.delete(settings).where(eq(settings.key, key)))
}
