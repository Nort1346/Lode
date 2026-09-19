import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { STATE_FILE } from '../constants'
import type { SetupSelection } from '../types'
import { writeAtomic } from './fs'

export const DEFAULT_SELECTION: SetupSelection = {
  dbDriver: 'sqlite',
  imageTag: 'latest',
  qbittorrent: 'local',
  prowlarr: 'local',
  mediaProvider: 'jellyfin',
  mediaMode: 'local',
  flaresolverr: false,
  dozzle: false
}

function oneOf<T extends string>(value: string | undefined, allowed: readonly T[], fallback: T): T {
  if (value !== undefined && (allowed as readonly string[]).includes(value)) return value as T
  return fallback
}

// Unknown/missing fields fall back to defaults instead of failing a re-run.
export function parseSelection(raw: Record<string, string>): SetupSelection {
  return {
    dbDriver: oneOf(raw['dbDriver'], ['sqlite', 'postgres'] as const, 'sqlite'),
    imageTag: oneOf(raw['imageTag'], ['latest', 'nightly'] as const, 'latest'),
    qbittorrent: oneOf(raw['qbittorrent'], ['local', 'external'] as const, 'local'),
    prowlarr: oneOf(raw['prowlarr'], ['local', 'external'] as const, 'local'),
    mediaProvider: oneOf(raw['mediaProvider'], ['jellyfin', 'none'] as const, 'jellyfin'),
    mediaMode: oneOf(raw['mediaMode'], ['local', 'external', 'none'] as const, 'local'),
    flaresolverr: raw['flaresolverr'] === 'true',
    dozzle: raw['dozzle'] === 'true'
  }
}

export function parseStateFile(content: string): Record<string, string> {
  const raw: Record<string, string> = {}
  for (const line of content.split('\n')) {
    const eq = line.indexOf('=')
    if (eq === -1) continue
    const key = line.slice(0, eq).trim()
    if (!key || key in raw) continue
    raw[key] = line.slice(eq + 1).trim()
  }
  return raw
}

export function loadSelection(dir: string): SetupSelection | null {
  const file = path.join(dir, STATE_FILE)
  if (!existsSync(file)) return null
  return parseSelection(parseStateFile(readFileSync(file, 'utf8')))
}

export function selectionToFile(selection: SetupSelection): string {
  return (
    [
      'version=1',
      `dbDriver=${selection.dbDriver}`,
      `imageTag=${selection.imageTag}`,
      `qbittorrent=${selection.qbittorrent}`,
      `prowlarr=${selection.prowlarr}`,
      `mediaProvider=${selection.mediaProvider}`,
      `mediaMode=${selection.mediaMode}`,
      `flaresolverr=${selection.flaresolverr}`,
      `dozzle=${selection.dozzle}`
    ].join('\n') + '\n'
  )
}

export function saveSelection(dir: string, selection: SetupSelection): void {
  writeAtomic(path.join(dir, STATE_FILE), selectionToFile(selection))
}
