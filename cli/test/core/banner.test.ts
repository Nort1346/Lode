import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { showTitleBanner } from '../../src/core/banner'

// ESC byte, built without a control character in the source.
const ESC = String.fromCharCode(27)
const BLOCK = '\u2588'

function setStdout(tty: boolean, columns: number | undefined): void {
  Object.defineProperty(process.stdout, 'isTTY', { value: tty, configurable: true, writable: true })
  Object.defineProperty(process.stdout, 'columns', { value: columns, configurable: true, writable: true })
}

let written: string[]
const envBackup = { NO_COLOR: process.env.NO_COLOR, TERM: process.env.TERM }

function firstWritten(): string {
  const chunk = written[0]
  if (chunk === undefined) throw new Error('banner did not write a string to stdout')
  return chunk
}

beforeEach(() => {
  written = []
  vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
    if (typeof chunk === 'string') written.push(chunk)
    return true
  })
})

afterEach(() => {
  vi.restoreAllMocks()
  if (envBackup.NO_COLOR === undefined) delete process.env.NO_COLOR
  else process.env.NO_COLOR = envBackup.NO_COLOR
  if (envBackup.TERM === undefined) delete process.env.TERM
  else process.env.TERM = envBackup.TERM
})

describe('showTitleBanner', () => {
  it('prints nothing when stdout is not a TTY', async () => {
    setStdout(false, undefined)
    await showTitleBanner()
    expect(written).toHaveLength(0)
  })

  it('prints the colored block banner on a TTY', async () => {
    setStdout(true, 100)
    await showTitleBanner()
    const out = firstWritten()
    expect(out).toContain(BLOCK)
    expect(out.includes(ESC)).toBe(true)
  })

  it('prints a monochrome banner when NO_COLOR is set', async () => {
    process.env.NO_COLOR = ''
    setStdout(true, 100)
    await showTitleBanner()
    const out = firstWritten()
    expect(out).toContain(BLOCK)
    expect(out.includes(ESC)).toBe(false)
  })

  it('prints a monochrome banner when TERM=dumb', async () => {
    process.env.TERM = 'dumb'
    setStdout(true, 100)
    await showTitleBanner()
    const out = firstWritten()
    expect(out).toContain(BLOCK)
    expect(out.includes(ESC)).toBe(false)
  })
})
