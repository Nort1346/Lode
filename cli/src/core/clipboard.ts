import { commandExists, run } from './exec'

const ESC = '\u001b'

// OSC 52 clipboard write: emitted unconditionally, the terminal decides
// whether it honors it; the visible value is the fallback.
export function copyToClipboardOsc52(text: string): void {
  if (!text) return
  const encoded = Buffer.from(text, 'utf8').toString('base64')
  process.stdout.write(`${ESC}]52;c;${encoded}${ESC}\\`)
}

interface ClipboardReader {
  command: string
  args: string[]
}

async function linuxReaders(): Promise<ClipboardReader[]> {
  const readers: ClipboardReader[] = []
  if (process.env.WAYLAND_DISPLAY) {
    if (await commandExists('wl-paste')) readers.push({ command: 'wl-paste', args: ['--no-newline'] })
  } else {
    if (await commandExists('xclip')) readers.push({ command: 'xclip', args: ['-selection', 'clipboard', '-o'] })
    if (await commandExists('xsel')) readers.push({ command: 'xsel', args: ['--clipboard', '--output'] })
  }
  return readers
}

export async function clipboardAvailable(): Promise<boolean> {
  const { platform } = process
  if (platform === 'darwin') return commandExists('pbpaste')
  if (platform === 'win32')
    return (await run('powershell', ['-NoProfile', '-Command', 'Get-Clipboard -Raw'])).code === 0
  return (await linuxReaders()).length > 0
}

export async function readClipboard(): Promise<string> {
  const { platform } = process
  let result: { code: number; stdout: string } | null = null
  if (platform === 'darwin') {
    result = await run('pbpaste')
  } else if (platform === 'win32') {
    result = await run('powershell', ['-NoProfile', '-Command', 'Get-Clipboard -Raw'])
  } else {
    for (const reader of await linuxReaders()) {
      result = await run(reader.command, reader.args)
      if (result.code === 0 && result.stdout.trim() !== '') break
    }
  }
  if (!result || result.code !== 0) return ''
  return result.stdout.replace(/\r/g, '').trim()
}
