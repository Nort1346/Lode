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

function getExtension(filename: string): string {
  const lastSlash = filename.lastIndexOf('/')
  const lastBackslash = filename.lastIndexOf('\\')
  const lastSeparator = Math.max(lastSlash, lastBackslash)
  const name = lastSeparator >= 0 ? filename.substring(lastSeparator + 1) : filename
  const lastDot = name.lastIndexOf('.')
  if (lastDot < 0) return ''
  return name.substring(lastDot + 1).toLowerCase()
}

export function checkForDangerousFiles(files: TorrentFile[]): { safe: boolean; dangerousFiles: string[] } {
  const dangerousFiles: string[] = []

  for (const file of files) {
    const ext = getExtension(file.name)
    if (ext.length > 0 && DANGEROUS_EXTENSIONS.has(ext)) {
      dangerousFiles.push(file.name)
    }
  }

  return {
    safe: dangerousFiles.length === 0,
    dangerousFiles
  }
}
