import { spawn } from 'node:child_process'
import type { CommandResult } from '../types'

interface RunOptions {
  cwd?: string
  /** Called for each complete line of stdout/stderr as it arrives (raw output stays captured). */
  onLine?: (line: string) => void
}

// Never throws: spawn failures (ENOENT, etc.) resolve with code 127 so callers
// can treat "command missing" uniformly with a non-zero exit.
export function run(command: string, args: readonly string[] = [], options: RunOptions = {}): Promise<CommandResult> {
  return new Promise((resolve) => {
    let stdout = ''
    let stderr = ''
    let settled = false
    const outPending = { text: '' }
    const errPending = { text: '' }
    const feed = (pending: { text: string }, text: string) => {
      pending.text += text
      const parts = pending.text.split(/[\r\n]+/)
      pending.text = parts.pop() ?? ''
      if (options.onLine) for (const line of parts) options.onLine(line)
    }
    const child = spawn(command, args, { cwd: options.cwd })
    child.stdout.on('data', (chunk: Buffer) => {
      const text = chunk.toString()
      stdout += text
      feed(outPending, text)
    })
    child.stderr.on('data', (chunk: Buffer) => {
      const text = chunk.toString()
      stderr += text
      feed(errPending, text)
    })
    child.on('error', (error: NodeJS.ErrnoException) => {
      if (settled) return
      settled = true
      resolve({ code: 127, stdout, stderr: `${stderr}${stderr ? '\n' : ''}${error.message}`.trim() })
    })
    child.on('close', (code) => {
      if (settled) return
      settled = true
      if (options.onLine) {
        if (outPending.text) options.onLine(outPending.text)
        if (errPending.text) options.onLine(errPending.text)
      }
      resolve({ code: code ?? 1, stdout, stderr })
    })
  })
}

export async function commandExists(command: string): Promise<boolean> {
  if (process.platform === 'win32') {
    const result = await run('where', [command])
    return result.code === 0
  }
  const quoted = `'${command.replace(/'/g, `'\\''`)}'`
  const result = await run('sh', ['-c', `command -v ${quoted}`])
  return result.code === 0
}
