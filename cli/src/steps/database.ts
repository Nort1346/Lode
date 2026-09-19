import { ENV_FILE, ENV_KEYS, PASSWORD_LENGTH, SECRET_MIN_LENGTH } from '../constants'
import { envValueMeetsMinLength, readEnvValue, updateEnv } from '../core/env'
import { askSelect, log, stepHeader } from '../core/prompt'
import { generatePassword } from '../core/secrets'
import type { DbDriver, StepContext } from '../types'

export async function chooseDatabase(ctx: StepContext): Promise<void> {
  stepHeader(5, 'Database driver')
  let initial: DbDriver = 'sqlite'
  if (ctx.stateFound) {
    initial = ctx.selection.dbDriver
  } else {
    const existing = readEnvValue(process.cwd(), ENV_FILE, ENV_KEYS.dbDriver)
    if (existing === 'postgres') initial = 'postgres'
    else if (existing !== '' && existing !== 'sqlite') log.info(`Existing database driver: ${existing}`)
  }
  const choice = await askSelect<DbDriver>(
    'Select database driver:',
    [
      { value: 'sqlite', label: 'SQLite (recommended)', hint: 'Zero config, file-based' },
      { value: 'postgres', label: 'PostgreSQL', hint: 'Full-featured, requires more resources' }
    ],
    initial
  )
  ctx.selection.dbDriver = choice
  log.success(`Database driver: ${choice}`)
  if (choice === 'postgres') {
    const dir = process.cwd()
    if (envValueMeetsMinLength(dir, ENV_FILE, ENV_KEYS.postgresPassword, SECRET_MIN_LENGTH)) {
      log.success('PostgreSQL password already set - keeping it')
    } else {
      updateEnv(dir, ENV_FILE, ENV_KEYS.postgresPassword, generatePassword(PASSWORD_LENGTH))
      log.success('PostgreSQL password generated')
    }
  }
}
