import { LODE_IMAGE } from '../constants'
import type { ComposeFileName } from '../types'
import { run } from './exec'

export function composeFileArgs(files: readonly ComposeFileName[]): string[] {
  // One -f per file: a single -f with bare filenames after it makes compose dump its usage.
  const args: string[] = []
  for (const file of files) args.push('-f', file)
  return args
}

export function compose(files: readonly ComposeFileName[], ...args: string[]) {
  return run('docker', ['compose', ...composeFileArgs(files), ...args])
}

// Copy-pasteable prefix for manual-command hints.
export function dcCmdPrefix(files: readonly ComposeFileName[]): string {
  return `docker compose ${composeFileArgs(files).join(' ')}`
}

export async function dockerVersion(): Promise<string | null> {
  const result = await run('docker', ['--version'])
  if (result.code !== 0) return null
  return /version ([^ ,]+)/.exec(result.stdout)?.[1] ?? null
}

export async function composeVersion(): Promise<string | null> {
  const result = await run('docker', ['compose', 'version', '--short'])
  if (result.code !== 0) return null
  return result.stdout.trim() || null
}

const DAEMON_ERROR_PATTERN =
  /failed to connect|cannot connect|permission denied|connection refused|cannot find|no such file/i

export interface DaemonCheck {
  reachable: boolean
  errorLines: string[]
  permissionDenied: boolean
}

export async function checkDaemon(): Promise<DaemonCheck> {
  const result = await run('docker', ['info'])
  if (result.code === 0) return { reachable: true, errorLines: [], permissionDenied: false }
  const output = `${result.stdout}\n${result.stderr}`
  // `docker info` prints the whole client section before failing - surface only the error lines.
  const lines = output
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
  const matched = lines.filter((line) => DAEMON_ERROR_PATTERN.test(line)).slice(0, 3)
  return {
    reachable: false,
    errorLines: matched.length > 0 ? matched : lines.slice(-3),
    permissionDenied: /permission denied/i.test(output)
  }
}

export async function imageExists(tag: string): Promise<boolean> {
  const result = await run('docker', ['image', 'inspect', `${LODE_IMAGE}:${tag}`])
  return result.code === 0
}

// `ps -q` exits 0 even when nothing matches, so an empty stdout means "not running".
export async function serviceRunning(files: readonly ComposeFileName[], service: string): Promise<boolean> {
  const result = await compose(files, 'ps', '-q', service)
  return result.code === 0 && result.stdout.trim().length > 0
}

export async function serviceLastLogLine(files: readonly ComposeFileName[], service: string): Promise<string> {
  const result = await compose(files, 'logs', service, '--tail', '3')
  const lines = (result.stdout + result.stderr)
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
  return lines.at(-1) ?? ''
}

export async function logsTail(files: readonly ComposeFileName[], service: string, tail: number): Promise<string> {
  const result = await compose(files, 'logs', '--no-color', '--tail', String(tail), service)
  return `${result.stdout}\n${result.stderr}`
}

export async function containerExists(container: string): Promise<boolean> {
  const result = await run('docker', ['ps', '-q', '--filter', `name=^${container}$`])
  return result.stdout.trim().length > 0
}

export async function stopAndRemoveContainer(container: string): Promise<void> {
  await run('docker', ['stop', container])
  await run('docker', ['rm', container])
}
