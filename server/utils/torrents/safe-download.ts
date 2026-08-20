import type { TorrentFile } from '#server/types/torrent'

const DANGEROUS_EXTENSIONS = new Set([
  // Windows executables
  'exe',
  'msi',
  'bat',
  'cmd',
  'com',
  'cpl',
  'hta',
  'inf',
  'lnk',
  'msp',
  'mst',
  'pif',
  'reg',
  'rgs',
  'scr',
  'sct',
  'shb',
  'shs',
  'u3p',
  // Scripts
  'js',
  'vbs',
  'vbe',
  'ws',
  'wsc',
  'wsf',
  'wsh',
  'ps1',
  'psm1',
  'psd1',
  'psc1',
  // Java
  'jar',
  // macOS
  'app',
  'dmg',
  'pkg',
  // Linux
  'deb',
  'rpm',
  'bin',
  'run',
  // Other
  'dll',
  'sys',
  'drv',
  'cpl'
])

function getExtensions(filename: string): string[] {
  const trimmed = filename.trim()
  const lastSlash = trimmed.lastIndexOf('/')
  const lastBackslash = trimmed.lastIndexOf('\\')
  const lastSeparator = Math.max(lastSlash, lastBackslash)
  const name = lastSeparator >= 0 ? trimmed.substring(lastSeparator + 1) : trimmed

  const extensions: string[] = []
  let start = name.length
  while (start > 0) {
    const dot = name.lastIndexOf('.', start - 1)
    if (dot < 0) break
    const segment = name.substring(dot + 1, start)
    if (segment.length > 0) extensions.push(segment.toLowerCase())
    if (dot === 0) break
    start = dot
  }
  return extensions
}

export function checkForDangerousFiles(
  files: TorrentFile[],
  minSizeBytes: number = 0
): { safe: boolean; dangerousFiles: string[] } {
  const dangerousFiles: string[] = []

  for (const file of files) {
    const extensions = getExtensions(file.name)
    if (extensions.some((ext) => DANGEROUS_EXTENSIONS.has(ext))) {
      dangerousFiles.push(file.name)
    }
    if (file.size > 0 && file.size < minSizeBytes) {
      dangerousFiles.push(`${file.name} (${file.size} bytes — below minimum ${minSizeBytes} bytes)`)
    }
  }

  return {
    safe: dangerousFiles.length === 0,
    dangerousFiles
  }
}
