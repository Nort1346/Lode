import { ensureAdminExists } from '#server/utils/seed'

export default defineNitroPlugin(() => {
  void ensureAdminExists()
})
