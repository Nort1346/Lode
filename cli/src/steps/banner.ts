import { askConfirm, intro, log, outro } from '../core/prompt'
import { VERSION } from '../core/version'

export async function showBanner(): Promise<void> {
  intro(`Lode Auto-Setup ${VERSION}`)
  log.message(['This will set up Lode and the services you choose.', 'All data will be stored in Docker volumes.'])
  if (!(await askConfirm('Do you want to continue?'))) {
    outro('Aborted.')
    process.exit(0)
  }
}
