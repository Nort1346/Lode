export type DbDriver = 'sqlite' | 'postgres'

export type LodeTag = 'latest' | 'nightly'

export type ServiceMode = 'local' | 'external'

export type MediaProvider = 'jellyfin' | 'none'

export type MediaMode = 'local' | 'external' | 'none'

export type ComposeFileName =
  | 'docker-compose.yml'
  | 'docker-compose.postgres.yml'
  | 'docker-compose.qbittorrent.yml'
  | 'docker-compose.prowlarr.yml'
  | 'docker-compose.jellyfin.yml'
  | 'docker-compose.flaresolverr.yml'
  | 'docker-compose.dozzle.yml'

/** User selection persisted in .lode-setup so re-runs can prefill prompts. */
export interface SetupSelection {
  dbDriver: DbDriver
  imageTag: LodeTag
  qbittorrent: ServiceMode
  prowlarr: ServiceMode
  mediaProvider: MediaProvider
  mediaMode: MediaMode
  flaresolverr: boolean
  dozzle: boolean
}

/** URLs for externally hosted services (only meaningful when the mode is external). */
export interface ExternalUrls {
  qbittorrent: string
  prowlarr: string
  jellyfin: string
}

export interface StepContext {
  /** True when a .lode-setup state file existed before this run. */
  stateFound: boolean
  /** Selection loaded from the state file before this run's prompts (drives deselection cleanup). */
  previousSelection: SetupSelection | null
  selection: SetupSelection
  urls: ExternalUrls
  composeFiles: ComposeFileName[]
  /** qBittorrent temporary password extracted from logs (local mode only). */
  qbitTempPass: string
  /** Admin password extracted from lode logs after first start. */
  adminPass: string
}

export interface PromptOption<T extends string = string> {
  value: T
  label: string
  hint?: string
}

export interface CommandResult {
  code: number
  stdout: string
  stderr: string
}

export interface SummaryRow {
  label: string
  value: string
}

export interface DeselectionCheck {
  service: string
  stateKey: keyof SetupSelection
  activeValue: string
}

export interface WaitPhase {
  label: string
  run: (update: (msg: string) => void) => Promise<void>
}

export interface ComposeProgress {
  image?: string
  stage?: string
}
