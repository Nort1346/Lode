import { ensureAdminExists } from '../utils/seed'

export default defineNitroPlugin(async () => {
  await ensureAdminExists()
})
