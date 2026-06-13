import { ensureAdminExists } from '../utils/seed'

export default defineNitroPlugin(() => {
  void ensureAdminExists()
})
