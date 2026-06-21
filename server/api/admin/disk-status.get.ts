import { checkAllDisks, isDiskCheckEnabled, getDiskMinFreeGb } from '#server/utils/disk'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const config = useRuntimeConfig()
  const disks = (config.disks as string).split(',').filter((d) => d.trim().length > 0)
  const minFreeGb = getDiskMinFreeGb()
  const enabled = isDiskCheckEnabled()

  const diskStatuses = checkAllDisks(disks, minFreeGb)

  return {
    disks: diskStatuses,
    minFreeSpaceGb: minFreeGb,
    checkEnabled: enabled
  }
})
