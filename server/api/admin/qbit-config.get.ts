import { getSetting } from '#server/utils/settings'
import { SETTINGS } from '#server/types/settings'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  return {
    autoRemoveCompleted: (await getSetting(SETTINGS.QBIT_AUTO_REMOVE_COMPLETED)) === 'true'
  }
})
