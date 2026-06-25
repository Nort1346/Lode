import { settings } from '#server/database/schema'
import { eq } from 'drizzle-orm'

export function getSetting(key: string): string | undefined {
  const row = useDb().select({ value: settings.value }).from(settings).where(eq(settings.key, key)).get()
  return row?.value
}

export function putSetting(key: string, value: string): void {
  const existing = useDb().select({ key: settings.key }).from(settings).where(eq(settings.key, key)).get()
  if (existing !== undefined) {
    useDb().update(settings).set({ value }).where(eq(settings.key, key)).run()
  } else {
    useDb().insert(settings).values({ key, value }).run()
  }
}

export function deleteSetting(key: string): void {
  useDb().delete(settings).where(eq(settings.key, key)).run()
}
