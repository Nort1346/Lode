import { checkAllDisks } from '#server/utils/disk'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const config = useRuntimeConfig()
  const disks = (config.disks as string).split(',').filter((d) => d.trim().length > 0)
  const minFreeGb = config.minFreeSpaceGb as number
  const enabled = config.diskSpaceCheckEnabled as boolean

  const diskStatuses = checkAllDisks(disks, minFreeGb)

  return {
    disks: diskStatuses,
    minFreeSpaceGb: minFreeGb,
    checkEnabled: enabled
  }
})
