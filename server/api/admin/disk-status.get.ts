import { checkAllDisks, isDiskCheckEnabled, getDiskMinFreeGb } from '#server/utils/disk'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const config = useRuntimeConfig()
  const disks = (config.disks as string).split(',').filter((d) => d.trim().length > 0)
  const minFreeGb = await getDiskMinFreeGb()
  const enabled = await isDiskCheckEnabled()

  const diskStatuses = await checkAllDisks(disks, minFreeGb)

  return {
    disks: diskStatuses,
    minFreeSpaceGb: minFreeGb,
    checkEnabled: enabled
  }
})
