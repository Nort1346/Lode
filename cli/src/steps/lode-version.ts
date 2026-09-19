import { readFileSync } from 'node:fs'
import path from 'node:path'
import { COMPOSE_BASE, LODE_IMAGE, STATE_FILE } from '../constants'
import { setLodeImageTag } from '../core/compose'
import { writeAtomic } from '../core/fs'
import { askSelect, log, stepHeader } from '../core/prompt'
import { saveSelection } from '../core/state'
import type { LodeTag, StepContext } from '../types'

export async function chooseLodeVersion(ctx: StepContext): Promise<void> {
  stepHeader(8, 'Lode version')
  const tag = await askSelect<LodeTag>(
    'Select version:',
    [
      { value: 'latest', label: 'latest (recommended)', hint: 'Stable release' },
      { value: 'nightly', label: 'nightly', hint: 'Latest dev build from main (may be unstable)' }
    ],
    ctx.selection.imageTag
  )
  ctx.selection.imageTag = tag

  const base = path.join(process.cwd(), COMPOSE_BASE)
  const { content: updated, changed } = setLodeImageTag(readFileSync(base, 'utf8'), tag)
  if (changed) {
    writeAtomic(base, updated)
    log.success(`Lode version: ${tag} (image: ${LODE_IMAGE}:${tag})`)
  } else {
    log.warn(`No lode image line found in ${COMPOSE_BASE} - check the image tag manually`)
  }

  saveSelection(process.cwd(), ctx.selection)
  log.success(`Selection saved to ${STATE_FILE}`)
}
