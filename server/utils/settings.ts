import { getReposAsync } from '#server/repositories'
import type { SettingKey } from '#server/types/settings'

export async function getSetting(key: SettingKey): Promise<string | undefined> {
  const repos = await getReposAsync()
  return repos.settings.get(key)
}

export async function putSetting(key: SettingKey, value: string): Promise<void> {
  const repos = await getReposAsync()
  await repos.settings.set(key, value)
}

export async function deleteSetting(key: SettingKey): Promise<void> {
  const repos = await getReposAsync()
  await repos.settings.delete(key)
}
