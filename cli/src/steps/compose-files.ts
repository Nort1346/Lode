import { copyFileSync, existsSync, readFileSync, renameSync, unlinkSync } from 'node:fs'
import { REPO_RAW } from '../constants'
import { maskLodeImageTag } from '../core/compose'
import { downloadFile } from '../core/download'
import { SetupFailure } from '../core/errors'
import { askConfirm, log, spinner, stepHeader } from '../core/prompt'
import type { StepContext } from '../types'

export async function downloadComposeFiles(ctx: StepContext): Promise<void> {
  stepHeader(7, 'Downloading compose files')
  const existing = ctx.composeFiles.filter((file) => existsSync(file))
  const missing = ctx.composeFiles.filter((file) => !existsSync(file))

  for (const file of missing) {
    const dl = spinner()
    dl.start(`Downloading ${file}...`)
    try {
      await downloadFile(`${REPO_RAW}/${file}`, file)
    } catch {
      dl.clear()
      throw new SetupFailure(`Failed to download ${file} from GitHub.`, [
        '  Check your internet connection and try again.'
      ])
    }
    dl.stop(`${file} downloaded`)
  }

  if (existing.length === 0) return
  const doUpdate = await askConfirm(
    `${existing.length} compose file(s) already exist. Download the latest versions from GitHub? (changed files keep a .bak backup)`
  )
  for (const file of existing) {
    if (!doUpdate) {
      log.success(`Using existing ${file}`)
      continue
    }
    try {
      await downloadFile(`${REPO_RAW}/${file}`, `${file}.tmp`)
    } catch {
      log.warn(`Could not download ${file} - keeping your local copy`)
      continue
    }
    const local = readFileSync(file, 'utf8')
    const remote = readFileSync(`${file}.tmp`, 'utf8')
    if (maskLodeImageTag(local) !== maskLodeImageTag(remote)) {
      copyFileSync(file, `${file}.bak`)
      renameSync(`${file}.tmp`, file)
      log.success(`${file} updated (backup saved as ${file}.bak)`)
    } else {
      unlinkSync(`${file}.tmp`)
      log.success(`${file} is already up to date`)
    }
  }
}
