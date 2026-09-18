import { spawn } from 'node:child_process'
import type { CommandResult } from '../types'

interface RunOptions {
  cwd?: string
}

// Never throws: spawn failures (ENOENT, etc.) resolve with code 127 so callers
// can treat "command missing" uniformly with a non-zero exit.
export function run(command: string, args: readonly string[] = [], options: RunOptions = {}): Promise<CommandResult> {
  return new Promise((resolve) => {
    let stdout = ''
    let stderr = ''
    let settled = false
    const child = spawn(command, args, { cwd: options.cwd })
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString()
    })
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString()
    })
    child.on('error', (error: NodeJS.ErrnoException) => {
      if (settled) return
      settled = true
      resolve({ code: 127, stdout, stderr: `${stderr}${stderr ? '\n' : ''}${error.message}`.trim() })
    })
    child.on('close', (code) => {
      if (settled) return
      settled = true
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
