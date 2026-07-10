import { settings } from '#server/database/schema'
import { eq } from 'drizzle-orm'
import { useDb } from '#server/utils/db'
import type { SettingKey } from '#server/types/settings'

export function getSetting(key: SettingKey): string | undefined {
  const row = useDb().select({ value: settings.value }).from(settings).where(eq(settings.key, key)).get()
  return row?.value
}

export function putSetting(key: SettingKey, value: string): void {
  const existing = useDb().select({ key: settings.key }).from(settings).where(eq(settings.key, key)).get()
  if (existing !== undefined) {
    useDb().update(settings).set({ value }).where(eq(settings.key, key)).run()
  } else {
    useDb().insert(settings).values({ key, value }).run()
  }
}

export function deleteSetting(key: SettingKey): void {
  useDb().delete(settings).where(eq(settings.key, key)).run()
}
