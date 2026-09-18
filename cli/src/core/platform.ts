import readline from 'node:readline'
import { run } from './exec'

// Parents that close their console window when the child exits (double-click,
// Start Menu, RDP, VS Code integrated terminal).
const TRANSIENT_PARENTS = new Set(['explorer.exe', 'conhost.exe', 'openconsole.exe', 'windowsterminal.exe', 'code.exe'])
// Intermediaries to walk through without concluding.
const PASSTHROUGH_PARENTS = new Set(['cmd.exe', 'conhost.exe', 'openconsole.exe'])

export function isTty(): boolean {
  return process.stdin.isTTY === true && process.stdout.isTTY === true
}

async function parentInfo(pid: number): Promise<{ pid: number; name: string } | null> {
  const script =
    `$p = Get-CimInstance Win32_Process -Filter "ProcessId = ${pid}" -ErrorAction SilentlyContinue; ` +
    'if ($p) { "${$p.ParentProcessId}|${$p.Name}" }'
  const result = await run('powershell', ['-NoProfile', '-Command', script])
  if (result.code !== 0) return null
  const line = result.stdout.trim()
  const sep = line.lastIndexOf('|')
  if (sep === -1) return null
  const parentPid = Number(line.slice(0, sep))
  const name = line.slice(sep + 1)
  if (!Number.isInteger(parentPid) || parentPid <= 0 || !name) return null
  return { pid: parentPid, name }
}

export async function isTransientWindowsWindow(): Promise<boolean> {
  let current = process.ppid
  for (let depth = 0; depth < 6 && current > 0; depth++) {
    const parent = await parentInfo(current)
    // Process info unavailable - assume the window closes so the output stays readable.
    if (!parent) return true
    const name = parent.name.toLowerCase()
    if (TRANSIENT_PARENTS.has(name)) return true
    if (!PASSTHROUGH_PARENTS.has(name)) return false
    current = parent.pid
  }
  return true
}

export async function pauseBeforeExit(): Promise<void> {
  if (process.platform !== 'win32') return
  if (!(await isTransientWindowsWindow())) return
  process.stdout.write('\n')
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  await new Promise<void>((resolve) => {
    rl.question('Press Enter to exit', () => {
      rl.close()
      resolve()
    })
  })
}
