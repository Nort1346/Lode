import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { envValueMeetsMinLength, readEnvValue, updateEnv, updateEnvFile } from '../../src/core/env'

describe('updateEnvFile', () => {
  it('replaces an active KEY= line', () => {
    expect(updateEnvFile('A=1\nB=2\n', 'B', 'new')).toBe('A=1\nB=new\n')
  })

  it('uncomments a "# KEY=" line in place', () => {
    expect(updateEnvFile('A=1\n# B=\nC=3\n', 'B', 'v')).toBe('A=1\nB=v\nC=3\n')
  })

  it('appends when the key is missing', () => {
    expect(updateEnvFile('A=1\n', 'B', 'v')).toBe('A=1\nB=v\n')
  })

  it('keeps values containing & and $ intact (no sed-style mangling)', () => {
    const value = 'a&b$c%d'
    const output = updateEnvFile('X=\n', 'X', value)
    expect(output).toContain(`X=${value}`)
  })
})

describe('env file access', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'lode-env-'))
  })
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('readEnvValue returns the value, or empty when key/file is missing', () => {
    writeFileSync(path.join(dir, '.env'), 'A=1\n')
    expect(readEnvValue(dir, '.env', 'A')).toBe('1')
    expect(readEnvValue(dir, '.env', 'B')).toBe('')
    expect(readEnvValue(dir, 'missing.env', 'A')).toBe('')
  })

  it('updateEnv is a no-op when the file does not exist', () => {
    expect(() => updateEnv(dir, 'missing.env', 'A', '1')).not.toThrow()
  })

  it('updateEnv writes through the replace/uncomment/append semantics', () => {
    writeFileSync(path.join(dir, '.env'), '# B=\n')
    updateEnv(dir, '.env', 'B', 'v')
    expect(readEnvValue(dir, '.env', 'B')).toBe('v')
  })

  it('envValueMeetsMinLength checks the stored value length', () => {
    writeFileSync(path.join(dir, '.env'), 'A=12345\n')
    expect(envValueMeetsMinLength(dir, '.env', 'A', 5)).toBe(true)
    expect(envValueMeetsMinLength(dir, '.env', 'A', 6)).toBe(false)
    expect(envValueMeetsMinLength(dir, '.env', 'B', 1)).toBe(false)
  })
})
