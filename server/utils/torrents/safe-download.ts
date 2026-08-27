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
  'dmg',
  'pkg',
  // Linux
  'deb',
  'rpm',
  'run',
  // Other
  'dll',
  'drv'
])

function getExtension(filename: string): string {
  const trimmed = filename.trim()
  const lastSlash = trimmed.lastIndexOf('/')
  const lastBackslash = trimmed.lastIndexOf('\\')
  const lastSeparator = Math.max(lastSlash, lastBackslash)
  const name = lastSeparator >= 0 ? trimmed.substring(lastSeparator + 1) : trimmed

  const dot = name.lastIndexOf('.')
  if (dot < 0 || dot === name.length - 1) return ''
  return name.substring(dot + 1).toLowerCase()
}

export function checkForDangerousFiles(files: TorrentFile[]): { safe: boolean; dangerousFiles: string[] } {
  const dangerousFiles: string[] = []

  for (const file of files) {
    const ext = getExtension(file.name)
    if (ext !== '' && DANGEROUS_EXTENSIONS.has(ext)) {
      dangerousFiles.push(file.name)
    }
  }

  return {
    safe: dangerousFiles.length === 0,
    dangerousFiles
  }
}
