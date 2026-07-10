import { describe, it, expect } from 'vitest'
import { checkForDangerousFiles } from '#server/utils/safe-download'
import type { TorrentFile } from '#server/types/torrent'

function makeFile(name: string): TorrentFile {
  return { index: 0, name, size: 100, progress: 1, priority: 0 }
}

describe('checkForDangerousFiles', () => {
  it('returns safe=true for empty file list', () => {
    const result = checkForDangerousFiles([])
    expect(result.safe).toBe(true)
    expect(result.dangerousFiles).toEqual([])
  })

  it('returns safe=true for media files', () => {
    const files = [makeFile('movie.mkv'), makeFile('subs.srt'), makeFile('poster.jpg')]
    const result = checkForDangerousFiles(files)
    expect(result.safe).toBe(true)
    expect(result.dangerousFiles).toEqual([])
  })

  it('detects .exe files', () => {
    const files = [makeFile('movie.mkv'), makeFile('setup.exe')]
    const result = checkForDangerousFiles(files)
    expect(result.safe).toBe(false)
    expect(result.dangerousFiles).toContain('setup.exe')
  })

  it('detects multiple dangerous extensions', () => {
    const files = [makeFile('script.js'), makeFile('install.bat'), makeFile('payload.ps1')]
    const result = checkForDangerousFiles(files)
    expect(result.safe).toBe(false)
    expect(result.dangerousFiles).toHaveLength(3)
  })

  it('detects .jar files', () => {
    const files = [makeFile('game.jar')]
    const result = checkForDangerousFiles(files)
    expect(result.safe).toBe(false)
    expect(result.dangerousFiles).toContain('game.jar')
  })

  it('detects .app and .dmg files (macOS)', () => {
    const files = [makeFile('installer.app'), makeFile('disk.dmg')]
    const result = checkForDangerousFiles(files)
    expect(result.safe).toBe(false)
    expect(result.dangerousFiles).toHaveLength(2)
  })

  it('detects .deb and .rpm (Linux)', () => {
    const files = [makeFile('package.deb'), makeFile('package.rpm')]
    const result = checkForDangerousFiles(files)
    expect(result.safe).toBe(false)
    expect(result.dangerousFiles).toHaveLength(2)
  })

  it('is case-insensitive for extensions', () => {
    const files = [makeFile('Setup.EXE'), makeFile('Script.JS')]
    const result = checkForDangerousFiles(files)
    expect(result.safe).toBe(false)
    expect(result.dangerousFiles).toHaveLength(2)
  })

  it('extracts extension from paths with directories', () => {
    const files = [makeFile('some/folder/with/virus.exe'), makeFile('C:\\\\Windows\\\\malware.bat')]
    const result = checkForDangerousFiles(files)
    expect(result.safe).toBe(false)
    expect(result.dangerousFiles).toHaveLength(2)
  })

  it('ignores files with no extension', () => {
    const files = [makeFile('README'), makeFile('Makefile')]
    const result = checkForDangerousFiles(files)
    expect(result.safe).toBe(true)
    expect(result.dangerousFiles).toEqual([])
  })

  it('ignores files with trailing dot', () => {
    const files = [makeFile('file.')]
    const result = checkForDangerousFiles(files)
    expect(result.safe).toBe(true)
    expect(result.dangerousFiles).toEqual([])
  })
})
