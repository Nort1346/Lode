import { getReposAsync } from '#server/repositories'
import type { User } from '#server/types/entities'

export async function getFreshUser(userId: string): Promise<User | undefined> {
  const repos = await getReposAsync()
  return repos.users.findById(userId)
}
